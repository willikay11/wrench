package waitlist

import (
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
	wailist := domain.Waitlist{
		Email: email,
	}

	err := s.waitListRepo.Save(&wailist)

	if err != nil {
		return domain.Waitlist{}, err
	}
	return wailist, nil
}
