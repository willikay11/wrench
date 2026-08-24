package ports

import (
	"context"

	"github.com/willikay11/wrench/api/internal/core/domain"
)

// Driving — the HTTP handler calls in through this.
type WaitlistService interface {
	JoinWaitlist(ctx context.Context, email string) (domain.Waitlist, error)
	CountWaitlist(ctx context.Context) (int, error)
}

// Driven — core calls out through this.
type WaitlistRepository interface {
	Save(ctx context.Context, waitlist *domain.Waitlist) error
	Count(ctx context.Context) (int, error)
}

type WaitlistCache interface {
	Count(ctx context.Context) (int, error)
	IncreaseCount(ctx context.Context, currentCount int) error
}
