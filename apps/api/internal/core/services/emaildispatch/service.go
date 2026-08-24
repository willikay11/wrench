package emaildispatch

import (
	"context"
	"errors"
	"time"

	"github.com/rs/zerolog/log"
	"github.com/willikay11/wrench/api/internal/core/domain"
	"github.com/willikay11/wrench/api/internal/core/ports"
)

const maxRetries = 3

// markTimeout budgets the status write on its own, detached from the dispatch
// pass. See markContext.
const markTimeout = 10 * time.Second

// markContext detaches a status write from the pass deadline.
//
// By the time we record an outcome the outcome has already happened at the
// provider — the email is sent, or it definitively failed. If the pass runs
// out of time before the write lands, the row stays in 'processing', the
// reaper hands it back, and we send the email a second time. So the write
// must not inherit a deadline that is about to expire.
func markContext(ctx context.Context) (context.Context, context.CancelFunc) {
	return context.WithTimeout(context.WithoutCancel(ctx), markTimeout)
}

type service struct {
	emailOutbox ports.EmailOutbox
	emailSender ports.EmailSender
	batchSize   int
	staleAfter  time.Duration
}

func NewService(emailOutbox ports.EmailOutbox, emailSender ports.EmailSender, batchSize int, staleAfter time.Duration) *service {
	return &service{
		emailOutbox: emailOutbox,
		emailSender: emailSender,
		batchSize:   batchSize,
		staleAfter:  staleAfter,
	}
}

func (s *service) DispatchPending(ctx context.Context) {
	// Recover rows abandoned in 'processing' by a worker that died mid-send.
	// ClaimPending never looks at them, so without this they are stranded.
	// Best effort: a failure here should not stop this pass from dispatching.
	reclaimed, err := s.emailOutbox.ReclaimStale(ctx, s.staleAfter)
	if err != nil {
		log.Error().Err(err).Msg("Failed to reclaim stale emails")
	} else if reclaimed > 0 {
		// Non-zero means workers are dying between the send and the mark.
		log.Warn().Int("count", reclaimed).Msg("Reclaimed stale emails stuck in processing")
	}

	pendingEmails, err := s.emailOutbox.ClaimPending(ctx, s.batchSize)

	if err != nil {
		// Log the error and return
		log.Error().Err(err).Msg("Failed to claim pending emails")
		return
	}

	for _, email := range pendingEmails {
		sentEmailId, sendErr := s.emailSender.SendEmail(ctx, domain.EmailMessage{
			// The row ID is stable across retries of the same email, which is
			// exactly what makes it usable as an idempotency key.
			IdempotencyKey: email.ID,
			To:             email.To,
			Subject:        email.Subject,
			Body:           email.Body,
		})

		if sendErr == nil {
			markCtx, cancel := markContext(ctx)
			err := s.emailOutbox.MarkSent(markCtx, email.ID, sentEmailId)
			cancel()

			if err != nil {
				log.Error().Err(err).Str("emailId", email.ID).Msg("Failed to mark email as sent")
			}
			continue
		}

		// A permanent failure produces the identical request next time, so
		// spending the remaining attempts on it only delays the inevitable.
		permanent := errors.Is(sendErr, domain.ErrEmailPermanent)

		if permanent || email.Attempts > maxRetries {
			log.Warn().Err(sendErr).
				Str("emailId", email.ID).
				Bool("permanent", permanent).
				Int("attempts", email.Attempts).
				Msg("Giving up on email")

			markCtx, cancel := markContext(ctx)
			err := s.emailOutbox.MarkFailed(markCtx, email.ID, sendErr.Error())
			cancel()

			if err != nil {
				log.Error().Err(err).Str("emailId", email.ID).Msg("Failed to mark email as failed")
			}
			continue
		}

		// TODO: exponential backoff — a flat hour is long for a welcome email.
		nextAttemptAt := time.Now().Add(1 * time.Hour)

		markCtx, cancel := markContext(ctx)
		err := s.emailOutbox.MarkForRetry(markCtx, email.ID, sendErr.Error(), nextAttemptAt)
		cancel()

		if err != nil {
			log.Error().Err(err).Str("emailId", email.ID).Msg("Failed to mark email for retry")
		}
	}
}
