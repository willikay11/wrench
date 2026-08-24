package notifier

import (
	"context"
	"errors"
	"fmt"
	"net/http"
	"time"

	"github.com/resend/resend-go/v3"

	"github.com/willikay11/wrench/api/internal/core/domain"
)

type ResendNotifier struct {
	resendClient *resend.Client
	fromEmail    string
}

func NewResendNotifier(resendClient *resend.Client, fromEmail string) *ResendNotifier {
	return &ResendNotifier{
		resendClient: resendClient,
		fromEmail:    fromEmail,
	}
}

// statusRecorder carries one call's HTTP status back out of the SDK.
//
// resend-go collapses every non-2xx response except 429 into a plain
// errors.New string, discarding the status code it just parsed (see the
// "TODO: replace this with a new ResendError type" in its handleError).
// Without the code we cannot tell a 422 bad address, which must never be
// retried, from a 503, which must be — so we capture it in the transport
// before the SDK throws it away.
type statusRecorder struct{ code int }

type statusCtxKey struct{}

// Transport records the response status for requests whose context carries a
// statusRecorder. Requests without one pass through untouched.
type Transport struct{ Base http.RoundTripper }

func (t *Transport) RoundTrip(req *http.Request) (*http.Response, error) {
	base := t.Base
	if base == nil {
		base = http.DefaultTransport
	}

	resp, err := base.RoundTrip(req)
	if rec, ok := req.Context().Value(statusCtxKey{}).(*statusRecorder); ok && resp != nil {
		rec.code = resp.StatusCode
	}
	return resp, err
}

// NewHTTPClient builds the client to hand to resend.NewCustomClient. The
// timeout matters: the SDK's default client has none, so a hung Resend would
// occupy a worker goroutine indefinitely.
func NewHTTPClient(timeout time.Duration) *http.Client {
	return &http.Client{
		Timeout:   timeout,
		Transport: &Transport{Base: http.DefaultTransport},
	}
}

func (r *ResendNotifier) SendEmail(ctx context.Context, msg domain.EmailMessage) (id string, err error) {
	recorder := &statusRecorder{}
	ctx = context.WithValue(ctx, statusCtxKey{}, recorder)

	params := resend.SendEmailRequest{
		From:    r.fromEmail,
		To:      []string{msg.To},
		Subject: msg.Subject,
		Html:    msg.Body,
	}

	// The key rides in an Idempotency-Key header on the POST. Resending the
	// same outbox row after a lost status write is then a no-op at Resend
	// rather than a second email in the recipient's inbox.
	options := resend.SendEmailOptions{IdempotencyKey: msg.IdempotencyKey}

	sent, err := r.resendClient.Emails.SendWithOptions(ctx, &params, &options)
	if err != nil {
		return "", classify(recorder.code, err)
	}

	return sent.Id, nil
}

// classify tags a failure as permanent or transient so the dispatch service
// can choose between MarkFailed and MarkForRetry without importing this
// package or knowing that Resend exists.
func classify(status int, err error) error {
	permanent := func() error {
		return fmt.Errorf("send email via resend: %w: %w", domain.ErrEmailPermanent, err)
	}
	transient := func() error {
		return fmt.Errorf("send email via resend: %w: %w", domain.ErrEmailTransient, err)
	}

	// Cancellation and deadlines say nothing about the email itself.
	if errors.Is(err, context.Canceled) || errors.Is(err, context.DeadlineExceeded) {
		return transient()
	}

	// Rejected by the SDK before any request was built, so the same payload
	// would be rejected again.
	var missingFields *resend.MissingRequiredFieldsError
	if errors.As(err, &missingFields) {
		return permanent()
	}

	switch {
	case status == 0:
		// Never reached Resend — DNS, refused connection, TLS.
		return transient()

	case status == http.StatusRequestTimeout,
		status == http.StatusTooManyRequests,
		status >= 500:
		return transient()

	case status == http.StatusUnauthorized, status == http.StatusForbidden:
		// A bad or rotated API key is an operator problem, not a bad email.
		// Failing these permanently would discard every queued message during
		// a misconfiguration; retrying leaves a window to fix the key.
		return transient()

	case status >= 400:
		// 400, 404, 422 — malformed payload or rejected address.
		return permanent()
	}

	// Unrecognised: prefer retrying over silently dropping mail.
	return transient()
}
