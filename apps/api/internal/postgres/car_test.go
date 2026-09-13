package postgres

import (
	"context"
	"errors"
	"testing"

	"github.com/jackc/pgx/v5/pgconn"
	"github.com/stretchr/testify/require"

	"github.com/willikay11/wrench/api/internal/core/domain"
)

/*
carWriteError is the whole translation layer between Postgres and the domain,
and it is a pure function of the error — so it is tested directly, without a
database. What it must get right is the pairing of SQLSTATE and constraint
name: a check violation on the wrong constraint, or the right name under the
wrong code, has to fall through as a server fault rather than be reported to
the caller as a rule they broke.
*/

// pgErr builds the error pgx surfaces for a rejected write.
func pgErr(code, constraint string) error {
	return &pgconn.PgError{Code: code, ConstraintName: constraint, TableName: "cars"}
}

func TestCarWriteErrorTranslatesConstraintsToDomainErrors(t *testing.T) {
	cases := []struct {
		name string
		err  error
		want error
	}{
		{
			name: "the usage type check",
			err:  pgErr(PgCheckViolation, "cars_usagetype_check"),
			want: domain.ErrInvalidUsageType,
		},
		{
			name: "the year range check",
			err:  pgErr(PgCheckViolation, "cars_year_check"),
			want: domain.ErrInvalidYear,
		},
		{
			name: "the owner foreign key",
			err:  pgErr(PgForeignKeyViolation, "cars_userid_fkey"),
			want: domain.ErrUnknownOwner,
		},
		{
			// 23502 names a column, not a constraint, so the code alone decides.
			name: "a not-null violation on any column",
			err:  &pgconn.PgError{Code: PgNotNullViolation, ColumnName: "make", TableName: "cars"},
			want: domain.ErrMissingField,
		},
		{
			// 22001 names neither: the limit is the column's own varchar width.
			name: "a value wider than its column",
			err:  &pgconn.PgError{Code: PgStringTooLong, TableName: "cars"},
			want: domain.ErrFieldTooLong,
		},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			require.ErrorIs(t, carWriteError(tc.err), tc.want)
		})
	}
}

// Everything the caller did not cause has to stay unmapped, so Save wraps it
// and the handler answers 500 instead of blaming the request.
func TestCarWriteErrorLeavesEverythingElseUnmapped(t *testing.T) {
	cases := []struct {
		name string
		err  error
	}{
		{name: "not a postgres error at all", err: errors.New("dial tcp: connection refused")},
		{name: "a cancelled context", err: context.Canceled},
		{
			// The right code on a constraint nothing maps: adding one to the
			// table without a line in carConstraintErrors must not silently
			// report the caller some neighbouring rule.
			name: "a check on an unmapped constraint",
			err:  pgErr(PgCheckViolation, "cars_mileage_check"),
		},
		{
			// A known constraint name under a code that does not mean what the
			// mapping assumes.
			name: "a known constraint under an unrelated code",
			err:  pgErr("40001", "cars_usagetype_check"),
		},
		{
			// Serialization failure and deadlock are retryable server faults,
			// never something the payload can be blamed for.
			name: "a serialization failure",
			err:  pgErr("40001", ""),
		},
		{
			name: "an undefined column",
			err:  pgErr("42703", ""),
		},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			require.NoError(t, carWriteError(tc.err))
		})
	}
}

// pgx wraps driver errors on the way up, so the mapping has to unwrap rather
// than type-assert — this is the shape Save actually receives.
func TestCarWriteErrorSeesThroughWrapping(t *testing.T) {
	wrapped := errors.Join(
		errors.New("create car entry"),
		pgErr(PgCheckViolation, "cars_usagetype_check"),
	)

	require.ErrorIs(t, carWriteError(wrapped), domain.ErrInvalidUsageType)
}

// Every constraint the migration declares needs a line in the map, or a write
// that trips it becomes a 500 with no explanation for the caller.
func TestEveryDeclaredCarConstraintIsMapped(t *testing.T) {
	for _, name := range []string{usageTypeConstraint, yearConstraint, ownerConstraint} {
		require.Contains(t, carConstraintErrors, name)
		require.Error(t, carConstraintErrors[name])
	}
}
