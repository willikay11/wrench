package queue

import (
	"context"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"

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

	// Resolve per call so this insert lands in the same transaction as the
	// row it belongs to — that atomicity is the whole point of the outbox.
	_, err := transaction.From(ctx, r.db).Exec(ctx, saveQuery, to, subject, body)
	if err != nil {
		return fmt.Errorf("enqueue outbox email: %w", err)
	}
	return nil
}
