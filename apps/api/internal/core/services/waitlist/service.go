package waitlist

import (
	"context"
	"net/mail"
	"strings"

	"github.com/rs/zerolog/log"
	"github.com/willikay11/wrench/api/internal/core/domain"
	"github.com/willikay11/wrench/api/internal/core/ports"
)

type service struct {
	waitListRepo  ports.WaitlistRepository
	waitListCache ports.WaitlistCache
	emailQueue    ports.EmailQueue
	txManager     ports.TxManager
}

func NewService(waitListRepo ports.WaitlistRepository, waitListCache ports.WaitlistCache, emailQueue ports.EmailQueue, txManager ports.TxManager) *service {
	return &service{
		waitListRepo:  waitListRepo,
		waitListCache: waitListCache,
		emailQueue:    emailQueue,
		txManager:     txManager,
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

	var count int
	err := s.txManager.WithinTransaction(ctx, func(ctx context.Context) error {
		if err := s.waitListRepo.Save(ctx, &waitlist); err != nil {
			return err
		}

		// A repeat signup touches the existing row rather than creating one.
		// Enqueueing again would mint a fresh outbox row with a fresh
		// idempotency key, so Resend could not collapse the two and the
		// address would receive a second welcome email. The endpoint is
		// public and unauthenticated, which makes that a way to mail-bomb a
		// third party from our sending domain.
		if !waitlist.IsNew {
			return nil
		}

		c, err := s.waitListRepo.Count(ctx)

		if err != nil {
			return err
		}

		count = c
		return s.emailQueue.EnqueueEmail(ctx, waitlist.Email, domain.WelcomeEmailSubject, domain.WelcomeEmailTemplateId, nil)
	})

	if err != nil {
		return domain.Waitlist{}, err
	}

	// Only a new row changes the count, and count is only populated on that
	// path — refreshing otherwise would write a zero into the cache.
	if waitlist.IsNew {
		if cacheErr := s.waitListCache.IncreaseCount(ctx, count); cacheErr != nil {
			log.Warn().Err(cacheErr).Msg("Failed to refresh waitlist count cache")
		}
	}

	return waitlist, nil
}

func (s *service) CountWaitlist(ctx context.Context) (int, error) {
	count, err := s.waitListCache.Count(ctx)

	if err != nil {
		count, err = s.waitListRepo.Count(ctx)
		if err != nil {
			return 0, err
		}
		if cacheErr := s.waitListCache.IncreaseCount(ctx, count); cacheErr != nil {
			log.Warn().Err(cacheErr).Msg("Failed to refresh waitlist count cache")
		}
	}

	return count, nil
}
