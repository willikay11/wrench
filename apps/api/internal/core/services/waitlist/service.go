package waitlist

import (
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

func (s *service) JoinWaitlist(email string) (domain.Waitlist, error) {
	email = strings.TrimSpace(email)
	address, errEmail := mail.ParseAddress(email)

	if errEmail != nil {
		return domain.Waitlist{}, domain.ErrInvalidEmail
	}

	waitlist := domain.Waitlist{
		Email: address.Address,
	}

	err := s.waitListRepo.Save(&waitlist)

	if err != nil {
		return domain.Waitlist{}, err
	}

	return waitlist, nil
}
