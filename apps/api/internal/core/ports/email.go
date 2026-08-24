package ports

import (
	"context"
	"time"

	"github.com/willikay11/wrench/api/internal/core/domain"
)

// Driving — the worker calls in through this.
type EmailDispatcher interface {
	DispatchPending(ctx context.Context)
}

// Driven — the write side of the outbox. Deliberately separate from
// EmailOutbox so services that only enqueue cannot reach the dispatch side.
type EmailQueue interface {
	EnqueueEmail(ctx context.Context, to string, subject string, body string) error
}

// Driven — the read and status side of the outbox, used by the dispatcher.
type EmailOutbox interface {
	ClaimPending(ctx context.Context, limit int) ([]domain.OutboxEmail, error)
	MarkSent(ctx context.Context, id, providerID string) error
	MarkForRetry(ctx context.Context, id, reason string, nextAttemptAt time.Time) error
	MarkFailed(ctx context.Context, id, reason string) error
	ReclaimStale(ctx context.Context, olderThan time.Duration) (int, error)
}

// Driven — the email provider.
type EmailSender interface {
	SendEmail(ctx context.Context, msg domain.EmailMessage) (id string, err error)
}
