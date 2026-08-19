package transaction

import (
	"context"
	"fmt"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

type TxManager struct {
	db *pgxpool.Pool
}

func NewTxManager(db *pgxpool.Pool) *TxManager {
	return &TxManager{db: db}
}

func (m *TxManager) WithinTransaction(ctx context.Context, fn func(context.Context) error) (err error) {
	tx, err := m.db.BeginTx(ctx, pgx.TxOptions{})
	if err != nil {
		return fmt.Errorf("begin transaction: %w", err)
	}

	// Cleanup must outlive a cancelled request context.
	cleanupCtx := context.WithoutCancel(ctx)

	defer func() {
		if p := recover(); p != nil {
			_ = tx.Rollback(cleanupCtx)
			panic(p)
		}
		if err != nil {
			_ = tx.Rollback(cleanupCtx)
			return
		}
		if cerr := tx.Commit(cleanupCtx); cerr != nil {
			err = fmt.Errorf("commit transaction: %w", cerr)
		}
	}()

	return fn(withTx(ctx, tx))
}
