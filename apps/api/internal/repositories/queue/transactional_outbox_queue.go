package queue

import (
	"context"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/willikay11/wrench/api/internal/core/domain"
	"github.com/willikay11/wrench/api/internal/repositories/transaction"
)

type TransactionalOutboxQueue struct {
	db *pgxpool.Pool
}

func NewTransactionalOutboxQueue(db *pgxpool.Pool) *TransactionalOutboxQueue {
	return &TransactionalOutboxQueue{
		db: db,
	}
}

const saveQuery = `
	INSERT INTO emailOutbox (recipient, subject, body)
	VALUES ($1, $2, $3)`

func (r *TransactionalOutboxQueue) EnqueueEmail(ctx context.Context, to string, subject string, body string) error {
	ctx, cancel := context.WithTimeout(ctx, 5*time.Second)
	defer cancel()

	_, err := transaction.From(ctx, r.db).Exec(ctx, saveQuery, to, subject, body)
	if err != nil {
		return fmt.Errorf("enqueue outbox email: %w", err)
	}
	return nil
}

const claimQuery = `
	UPDATE emailOutbox
	SET status = 'processing', attempts = attempts + 1, updatedAt = NOW()
	WHERE id IN (
		SELECT id FROM emailOutbox
		WHERE status = 'pending' AND nextAttemptAt <= NOW()
		ORDER BY createdAt
		FOR UPDATE SKIP LOCKED
		LIMIT $1
	)
	RETURNING id, recipient, subject, body, attempts`

func (r *TransactionalOutboxQueue) ClaimPending(ctx context.Context, limit int) ([]domain.OutboxEmail, error) {
	ctx, cancel := context.WithTimeout(ctx, 5*time.Second)
	defer cancel()

	rows, err := transaction.From(ctx, r.db).Query(ctx, claimQuery, limit)
	if err != nil {
		return nil, fmt.Errorf("claim pending outbox emails: %w", err)
	}
	defer rows.Close()

	var emails []domain.OutboxEmail
	for rows.Next() {
		var email domain.OutboxEmail
		if err := rows.Scan(&email.ID, &email.To, &email.Subject, &email.Body, &email.Attempts); err != nil {
			return nil, fmt.Errorf("scan outbox email: %w", err)
		}
		emails = append(emails, email)
	}

	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("iterate outbox emails: %w", err)
	}
	return emails, nil
}

const markSentQuery = `
	UPDATE emailOutbox
	SET status = 'sent', providerID = $2, sentAt = NOW(), updatedAt = NOW()
	WHERE id = $1`

func (r *TransactionalOutboxQueue) MarkSent(ctx context.Context, id, providerID string) error {
	ctx, cancel := context.WithTimeout(ctx, 5*time.Second)
	defer cancel()

	_, err := transaction.From(ctx, r.db).Exec(ctx, markSentQuery, id, providerID)
	if err != nil {
		return fmt.Errorf("mark outbox email as sent: %w", err)
	}
	return nil
}

const markFailedQuery = `
	UPDATE emailOutbox
	SET status = 'failed', lastError = $2, updatedAt = NOW()
	WHERE id = $1`

func (r *TransactionalOutboxQueue) MarkFailed(ctx context.Context, id string, reason string) error {
	ctx, cancel := context.WithTimeout(ctx, 5*time.Second)
	defer cancel()

	_, err := transaction.From(ctx, r.db).Exec(ctx, markFailedQuery, id, reason)
	if err != nil {
		return fmt.Errorf("mark outbox email as failed: %w", err)
	}
	return nil
}

const reclaimStaleQuery = `
	UPDATE emailOutbox
	SET status = 'pending'
	WHERE status = 'processing' AND updatedAt < NOW() - make_interval(secs => $1)`

func (r *TransactionalOutboxQueue) ReclaimStale(ctx context.Context, olderThan time.Duration) (int, error) {
	ctx, cancel := context.WithTimeout(ctx, 5*time.Second)
	defer cancel()

	tag, err := transaction.From(ctx, r.db).Exec(ctx, reclaimStaleQuery, int(olderThan.Seconds()))
	if err != nil {
		return 0, fmt.Errorf("reclaim stale outbox emails: %w", err)
	}
	return int(tag.RowsAffected()), nil
}

// MarkForRetry puts the row back in the claimable pool with a future
// nextAttemptAt, so ClaimPending skips it until the backoff has elapsed.
const markForRetryQuery = `
	UPDATE emailOutbox
	SET status = 'pending', lastError = $2, nextAttemptAt = $3, updatedAt = NOW()
	WHERE id = $1`

func (r *TransactionalOutboxQueue) MarkForRetry(ctx context.Context, id, reason string, nextAttemptAt time.Time) error {
	ctx, cancel := context.WithTimeout(ctx, 5*time.Second)
	defer cancel()

	_, err := transaction.From(ctx, r.db).Exec(ctx, markForRetryQuery, id, reason, nextAttemptAt)
	if err != nil {
		return fmt.Errorf("mark outbox email for retry: %w", err)
	}
	return nil
}
