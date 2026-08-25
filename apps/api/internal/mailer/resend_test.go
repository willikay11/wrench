package mailer

import (
	"context"
	"errors"
	"net/http"
	"net/http/httptest"
	"net/url"
	"testing"
	"time"

	"github.com/resend/resend-go/v3"
	"github.com/willikay11/wrench/api/internal/core/domain"
)

func notifierAgainst(t *testing.T, status int, bodyJSON string) *Resend {
	t.Helper()
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(status)
		_, _ = w.Write([]byte(bodyJSON))
	}))
	t.Cleanup(srv.Close)

	c := resend.NewCustomClient(NewHTTPClient(5*time.Second), "re_test")
	u, _ := url.Parse(srv.URL + "/")
	c.BaseURL = u
	return NewResend(c, "Wrench <hi@wrench.it.com>")
}

func TestClassification(t *testing.T) {
	cases := []struct {
		name   string
		status int
		body   string
		want   error
	}{
		{"422 bad address", 422, `{"statusCode":422,"message":"Invalid to field"}`, domain.ErrEmailPermanent},
		{"400 bad request", 400, `{"statusCode":400,"message":"nope"}`, domain.ErrEmailPermanent},
		{"404 not found", 404, `{"message":"not found"}`, domain.ErrEmailPermanent},
		{"429 rate limited", 429, `{"message":"slow down"}`, domain.ErrEmailTransient},
		{"401 bad key", 401, `{"message":"bad key"}`, domain.ErrEmailTransient},
		{"403 forbidden", 403, `{"message":"forbidden"}`, domain.ErrEmailTransient},
		{"500 provider down", 500, `{"message":"boom"}`, domain.ErrEmailTransient},
		{"503 unavailable", 503, `{"message":"unavailable"}`, domain.ErrEmailTransient},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			n := notifierAgainst(t, tc.status, tc.body)
			_, err := n.SendEmail(context.Background(), domain.EmailMessage{IdempotencyKey: "outbox-row-1", To: "a@b.com", Subject: "s", TemplateID: "t", TemplateVariables: map[string]any{"x": 1}})
			if err == nil {
				t.Fatal("expected an error")
			}
			if !errors.Is(err, tc.want) {
				t.Fatalf("status %d classified wrong\n  got:  %v", tc.status, err)
			}
			t.Logf("%d -> %v", tc.status, tc.want)
		})
	}
}

func TestSuccessAndNetworkFailure(t *testing.T) {
	n := notifierAgainst(t, 200, `{"id":"msg_abc123"}`)
	id, err := n.SendEmail(context.Background(), domain.EmailMessage{IdempotencyKey: "outbox-row-1", To: "a@b.com", Subject: "s", TemplateID: "t", TemplateVariables: map[string]any{"x": 1}})
	if err != nil || id != "msg_abc123" {
		t.Fatalf("success path broken: id=%q err=%v", id, err)
	}
	t.Logf("200 -> id=%s", id)

	// Unreachable host: no response at all, so status stays 0.
	c := resend.NewCustomClient(NewHTTPClient(2*time.Second), "re_test")
	u, _ := url.Parse("http://127.0.0.1:1/")
	c.BaseURL = u
	_, err = NewResend(c, "x@y.com").SendEmail(context.Background(), domain.EmailMessage{IdempotencyKey: "outbox-row-2", To: "a@b.com", Subject: "s", TemplateID: "t", TemplateVariables: map[string]any{"x": 1}})
	if !errors.Is(err, domain.ErrEmailTransient) {
		t.Fatalf("connection refused should be transient, got: %v", err)
	}
	t.Logf("connection refused -> transient")
}

// The whole duplicate-suppression story rests on this header reaching Resend,
// and the SDK only sets it for POST with a non-empty key — so assert it.
func TestIdempotencyKeyIsSent(t *testing.T) {
	var gotKey, gotMethod string

	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		gotKey = r.Header.Get("Idempotency-Key")
		gotMethod = r.Method
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"id":"msg_1"}`))
	}))
	defer srv.Close()

	c := resend.NewCustomClient(NewHTTPClient(5*time.Second), "re_test")
	u, _ := url.Parse(srv.URL + "/")
	c.BaseURL = u
	n := NewResend(c, "Wrench <hi@wrench.it.com>")

	const rowID = "f8d3904f-7117-474e-a696-3eb8b802ab22"

	// Two sends of the same outbox row — the retry after a lost status write.
	for i := 0; i < 2; i++ {
		if _, err := n.SendEmail(context.Background(), domain.EmailMessage{
			IdempotencyKey: rowID, To: "a@b.com", Subject: "s", TemplateID: "t", TemplateVariables: map[string]any{"x": 1},
		}); err != nil {
			t.Fatalf("send %d: %v", i+1, err)
		}
		if gotMethod != http.MethodPost {
			t.Fatalf("send %d: method %s, header only set on POST", i+1, gotMethod)
		}
		if gotKey != rowID {
			t.Fatalf("send %d: Idempotency-Key = %q, want the outbox row ID", i+1, gotKey)
		}
	}

	t.Logf("both sends carried Idempotency-Key: %s", gotKey)
}
