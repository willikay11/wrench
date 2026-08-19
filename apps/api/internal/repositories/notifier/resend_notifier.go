package notifier

import (
	"context"

	"github.com/resend/resend-go/v3"
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

func (r *ResendNotifier) SendEmail(ctx context.Context, to string, subject string, body string) (id string, err error) {
	params := resend.SendEmailRequest{
		From:    r.fromEmail,
		To:      []string{to},
		Subject: subject,
		Html:    body,
	}

	sent, err := r.resendClient.Emails.SendWithContext(ctx, &params)

	if err != nil {
		return "", err
	}

	return sent.Id, nil
}
