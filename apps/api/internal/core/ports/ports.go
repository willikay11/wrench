package ports

import "github.com/willikay11/wrench/api/internal/core/domain"

type WaitlistRepository interface {
	Save(waitlist *domain.Waitlist) error
}

type WaitlistService interface {
	JoinWaitlist(email string) (domain.Waitlist, error)
}
