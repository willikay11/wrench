package waitlist

import (
	"context"
	"net/mail"
	"strings"

	"github.com/willikay11/wrench/api/internal/core/domain"
	"github.com/willikay11/wrench/api/internal/core/ports"
)

type service struct {
	waitListRepo ports.WaitlistRepository
}

func NewService(waitListRepo ports.WaitlistRepository) *service {
	return &service{
		waitListRepo: waitListRepo,
	}
}

func (s *service) JoinWaitlist(ctx context.Context, email string) (domain.Waitlist, error) {
	address, errEmail := mail.ParseAddress(email)

	if errEmail != nil {
		return domain.Waitlist{}, domain.ErrInvalidEmail
	}

	waitlist := domain.Waitlist{
		Email: strings.ToLower(address.Address),
	}

	err := s.waitListRepo.Save(ctx, &waitlist)

	if err != nil {
		return domain.Waitlist{}, err
	}

	return waitlist, nil
}
