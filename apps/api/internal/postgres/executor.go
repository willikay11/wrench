package postgres

import (
	"context"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgxpool"
)

// ctxKey is an unexported empty struct, so no other package can collide with
// the value we store under it.
type ctxKey struct{}

// withTx returns a ctx carrying the in-flight transaction. Only TxManager
// calls this — adapters read it back through From.
func withTx(ctx context.Context, tx pgx.Tx) context.Context {
	return context.WithValue(ctx, ctxKey{}, tx)
}

// executor is the subset of the pgx API the repositories use. Both
// *pgxpool.Pool and pgx.Tx satisfy it, which is what lets an adapter run
// either inside a transaction or standalone without knowing which.
type executor interface {
	QueryRow(ctx context.Context, sql string, args ...any) pgx.Row
	Exec(ctx context.Context, sql string, args ...any) (pgconn.CommandTag, error)
	Query(ctx context.Context, sql string, args ...any) (pgx.Rows, error)
}

// from returns the transaction in flight on ctx, falling back to the pool when
// there is none. Adapters call this per query rather than holding the pool
// directly, so a caller wrapping them in WithinTransaction makes them join it.
func from(ctx context.Context, pool *pgxpool.Pool) executor {
	if tx, ok := ctx.Value(ctxKey{}).(pgx.Tx); ok {
		return tx
	}
	return pool
}
