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
	emailQueue   ports.EmailQueue
	txManager    ports.TxManager
}

func NewService(waitListRepo ports.WaitlistRepository, emailQueue ports.EmailQueue, txManager ports.TxManager) *service {
	return &service{
		waitListRepo: waitListRepo,
		emailQueue:   emailQueue,
		txManager:    txManager,
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

	err := s.txManager.WithinTransaction(ctx, func(ctx context.Context) error {
		if err := s.waitListRepo.Save(ctx, &waitlist); err != nil {
			return err
		}
		return s.emailQueue.EnqueueEmail(ctx, waitlist.Email, domain.WelcomeEmailSubject, domain.WelcomeEmailTemplateId, nil)
	})

	if err != nil {
		return domain.Waitlist{}, err
	}

	return waitlist, nil
}

func (s *service) CountWaitlist(ctx context.Context) (count int, error error) {
	count, err := s.waitListRepo.Count(ctx)

	if err != nil {
		return 0, err
	}

	if count > 0 && count < 150 {
		return 150 + count, nil
	}

	return count, nil
}
