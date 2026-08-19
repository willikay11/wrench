package ports

import (
	"context"

	"github.com/willikay11/wrench/api/internal/core/domain"
)

type WaitlistRepository interface {
	Save(ctx context.Context, waitlist *domain.Waitlist) error
}

type WaitlistService interface {
	JoinWaitlist(ctx context.Context, email string) (domain.Waitlist, error)
}

type EmailQueue interface {
	EnqueueEmail(ctx context.Context, to string, subject string, body string) error
}

type EmailNotifier interface {
	SendEmail(ctx context.Context, to string, subject string, body string) (id string, err error)
}

type TxManager interface {
	WithinTransaction(ctx context.Context, fn func(ctx context.Context) error) error
}
