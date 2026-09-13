package postgres

import (
	"context"
	"fmt"

	"github.com/jackc/pgx/v5/pgxpool"
)

// The SQLSTATE codes the repositories translate. Spelled out rather than
// pulled in via github.com/jackc/pgerrcode, which isn't a dependency yet.
const (
	PgStringTooLong       = "22001" // string_data_right_truncation
	PgNotNullViolation    = "23502" // not_null_violation
	PgForeignKeyViolation = "23503" // foreign_key_violation
	PgCheckViolation      = "23514" // check_violation
)

// NewPool opens a connection pool and verifies it can actually reach the
// database. A pool (not a single connection) is what you want behind an HTTP
// server: pgx.Conn is not safe for concurrent use, pgxpool.Pool is.
func NewPool(ctx context.Context, databaseURL string) (*pgxpool.Pool, error) {
	pool, err := pgxpool.New(ctx, databaseURL)
	if err != nil {
		return nil, fmt.Errorf("connect to postgres: %w", err)
	}

	// pgxpool.New is lazy — it does not dial until the first query, so ping
	// here to fail fast on a bad URL or an unreachable database.
	if err := pool.Ping(ctx); err != nil {
		pool.Close()
		return nil, fmt.Errorf("ping postgres: %w", err)
	}

	return pool, nil
}
