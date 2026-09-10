package postgres

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/willikay11/wrench/api/internal/core/domain"
)

// Postgres names a single-column table check <table>_<column>_check and a
// foreign key <table>_<column>_fkey, folding unquoted columns to lower case —
// so usageType's constraint is cars_usagetype_check, not cars_usageType_check.
const (
	usageTypeConstraint = "cars_usagetype_check"
	yearConstraint      = "cars_year_check"
	ownerConstraint     = "cars_userid_fkey"
)

// carConstraintErrors maps each named constraint on cars to the domain error
// it stands for. Keyed by name rather than matched in a chain of ifs so that a
// constraint added to the table without a line here stays an unmapped 500 —
// loudly wrong — instead of quietly arriving as some neighbouring error.
var carConstraintErrors = map[string]error{
	usageTypeConstraint: domain.ErrInvalidUsageType,
	yearConstraint:      domain.ErrInvalidYear,
	ownerConstraint:     domain.ErrUnknownOwner,
}

// carWriteError translates a rejected write into the domain error the caller
// can act on, returning nil when the failure is not one the caller caused —
// a dropped connection, a timeout, a column that no longer exists. Those stay
// wrapped as-is so they surface as the server faults they are.
func carWriteError(err error) error {
	var pgErr *pgconn.PgError
	if !errors.As(err, &pgErr) {
		return nil
	}

	switch pgErr.Code {
	case PgCheckViolation, PgForeignKeyViolation:
		// A nil from the map is the unmapped case, which is what we want.
		return carConstraintErrors[pgErr.ConstraintName]
	case PgNotNullViolation:
		// Reachable only for a column whose Go type can carry nil; the string
		// fields send "" for absent, which NOT NULL accepts. See ErrMissingField.
		return domain.ErrMissingField
	case PgStringTooLong:
		// 22001 names no constraint — the limit is the column type itself.
		return domain.ErrFieldTooLong
	default:
		return nil
	}
}

type carRepo struct {
	db *pgxpool.Pool
}

func NewCarRepository(db *pgxpool.Pool) *carRepo {
	return &carRepo{db: db}
}

const createCarQuery = `INSERT INTO cars (userId, make, model, year, engine, usageType, notes) VALUES ($1, $2, $3, $4, $5, $6, $7) Returning id`

func (r *carRepo) Save(ctx context.Context, car domain.Car) (domain.Car, error) {
	ctx, cancel := context.WithTimeout(ctx, 5*time.Second)
	defer cancel()

	var id string

	err := from(ctx, r.db).QueryRow(ctx, createCarQuery, car.UserId, car.Make, car.Model, car.Year, car.Engine, car.UsageType, car.Notes).Scan(&id)
	if err != nil {
		if mapped := carWriteError(err); mapped != nil {
			return domain.Car{}, mapped
		}
		return domain.Car{}, fmt.Errorf("create car entry: %w", err)
	}

	uid, err := uuid.Parse(id)
	if err != nil {
		return domain.Car{}, fmt.Errorf("parse user id: %w", err)
	}

	car.Id = uid

	return car, nil
}
