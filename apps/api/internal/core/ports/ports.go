package ports

import (
	"context"
	"time"

	"github.com/willikay11/wrench/api/internal/core/domain"
)

// Driver Ports
type WaitlistService interface {
	JoinWaitlist(ctx context.Context, email string) (domain.Waitlist, error)
}

type EmailDispatcher interface {
	DispatchPending(ctx context.Context) error
}

// Driven Ports
type WaitlistRepository interface {
	Save(ctx context.Context, waitlist *domain.Waitlist) error
}

type EmailQueue interface {
	EnqueueEmail(ctx context.Context, to string, subject string, body string) error
}

type EmailSender interface {
	SendEmail(ctx context.Context, to string, subject string, body string) (id string, err error)
}

type EmailOutbox interface {
	ClaimPending(ctx context.Context, limit int) ([]domain.OutboxEmail, error)
	MarkSent(ctx context.Context, id, providerID string) error
	MarkForRetry(ctx context.Context, id, reason string, nextAttemptAt time.Time) error
	MarkFailed(ctx context.Context, id, reason string) error // terminal
}

type TxManager interface {
	WithinTransaction(ctx context.Context, fn func(ctx context.Context) error) error
}
