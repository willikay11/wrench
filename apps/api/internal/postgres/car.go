package postgres

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
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

const createCarQuery = `INSERT INTO cars (userId, make, model, year, engine, usageType, notes) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id, createdAt, updatedAt`

func (r *carRepo) Save(ctx context.Context, car domain.Car) (domain.Car, error) {
	ctx, cancel := context.WithTimeout(ctx, 5*time.Second)
	defer cancel()

	var id string

	// The timestamps come back from the statement rather than being guessed
	// here, so the car returned to the caller is the row as stored.
	err := from(ctx, r.db).QueryRow(ctx, createCarQuery, car.UserId, car.Make, car.Model, car.Year, car.Engine, car.UsageType, car.Notes).
		Scan(&id, &car.CreatedAt, &car.UpdatedAt)
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

// The update names the owner as well as the id, so a car belonging to someone
// else matches no row — the same outcome as a car that does not exist, which is
// what keeps the endpoint from confirming that another user's id is real.
// COALESCE on the way out because notes is the one nullable column, while
// domain.Car carries it as a string.
const updateCarQuery = `UPDATE cars SET %s WHERE id = $%d AND userId = $%d
	RETURNING id, userId, make, model, year, engine, usageType, COALESCE(notes, ''), createdAt, updatedAt`

func (r *carRepo) Update(ctx context.Context, updateCar domain.UpdateCar) (domain.Car, error) {
	ctx, cancel := context.WithTimeout(ctx, 5*time.Second)
	defer cancel()

	setClauses := []string{}
	args := []any{}

	set := func(column string, value any) {
		args = append(args, value)
		setClauses = append(setClauses, fmt.Sprintf("%s = $%d", column, len(args)))
	}

	if updateCar.Make != nil {
		set("make", *updateCar.Make)
	}
	if updateCar.Model != nil {
		set("model", *updateCar.Model)
	}
	if updateCar.Year != nil {
		set("year", *updateCar.Year)
	}
	if updateCar.Engine != nil {
		set("engine", *updateCar.Engine)
	}
	if updateCar.UsageType != nil {
		set("usageType", *updateCar.UsageType)
	}
	// Sent rather than non-nil: notes sent as null is an instruction to clear
	// the column, and only an omitted notes leaves it alone.
	if updateCar.Notes.Sent {
		set("notes", updateCar.Notes.Value)
	}

	if len(setClauses) == 0 {
		return domain.Car{}, domain.ErrNoFieldsToUpdate
	}

	// The row's own timestamp, not the application's clock, and not a column
	// the caller can name — createdAt is never in setClauses.
	setClauses = append(setClauses, "updatedAt = NOW()")

	args = append(args, updateCar.Id, updateCar.UserId)
	query := fmt.Sprintf(updateCarQuery, strings.Join(setClauses, ", "), len(args)-1, len(args))

	// RETURNING makes the row as written the single source of the response, so
	// no field of the reply can drift from what was actually stored.
	var car domain.Car
	err := from(ctx, r.db).QueryRow(ctx, query, args...).Scan(
		&car.Id, &car.UserId, &car.Make, &car.Model, &car.Year,
		&car.Engine, &car.UsageType, &car.Notes, &car.CreatedAt, &car.UpdatedAt,
	)
	if err != nil {
		// No row updated: the car is missing, or it is not this user's. The
		// caller is told the same thing either way.
		if errors.Is(err, pgx.ErrNoRows) {
			return domain.Car{}, domain.ErrCarNotFound
		}
		if mapped := carWriteError(err); mapped != nil {
			return domain.Car{}, mapped
		}
		return domain.Car{}, fmt.Errorf("update car entry: %w", err)
	}

	return car, nil
}

// listCarsQuery walks the garage newest first. The keyset predicate compares
// the (createdAt, id) pair as a tuple, which is what makes the page boundary
// exact when several cars share a createdAt — a comparison on createdAt alone
// would drop or repeat every row sharing the boundary instant.
//
// ORDER BY must match the tuple exactly, or the predicate and the ordering
// disagree and rows go missing.
const listCarsQuery = `
	SELECT id, userId, make, model, year, engine, usageType, COALESCE(notes, ''), createdAt, updatedAt
	FROM cars
	WHERE userId = $1
	  AND ($2::timestamptz IS NULL OR (createdAt, id) < ($2::timestamptz, $3::uuid))
	ORDER BY createdAt DESC, id DESC
	LIMIT $4`

const countCarsQuery = `SELECT count(*) FROM cars WHERE userId = $1`

func (r *carRepo) List(ctx context.Context, query domain.CarQuery) (domain.CarPage, error) {
	ctx, cancel := context.WithTimeout(ctx, 5*time.Second)
	defer cancel()

	// The cursor is a position, never an owner: userId comes from the query,
	// which the handler filled from the token. A cursor naming another user's
	// car narrows the page and can never widen it past this WHERE clause.
	var after any
	var afterId any
	if query.Cursor != nil {
		after = query.Cursor.CreatedAt
		afterId = query.Cursor.Id
	}

	// One more row than asked for: its presence is what says there is another
	// page, without a second query and without counting the whole table.
	rows, err := from(ctx, r.db).Query(ctx, listCarsQuery, query.UserId, after, afterId, query.Limit+1)
	if err != nil {
		return domain.CarPage{}, fmt.Errorf("list cars: %w", err)
	}
	defer rows.Close()

	cars := make([]domain.Car, 0, query.Limit)
	for rows.Next() {
		var car domain.Car
		if err := rows.Scan(&car.Id, &car.UserId, &car.Make, &car.Model, &car.Year,
			&car.Engine, &car.UsageType, &car.Notes, &car.CreatedAt, &car.UpdatedAt); err != nil {
			return domain.CarPage{}, fmt.Errorf("scan car: %w", err)
		}
		cars = append(cars, car)
	}
	if err := rows.Err(); err != nil {
		return domain.CarPage{}, fmt.Errorf("list cars: %w", err)
	}

	page := domain.CarPage{HasMore: len(cars) > query.Limit}
	if page.HasMore {
		cars = cars[:query.Limit]
	}
	page.Cars = cars

	// Only when there is a further page: a nextCursor on the last page would
	// have a client fetch an empty one to find out it had finished.
	if page.HasMore {
		last := cars[len(cars)-1]
		page.NextCursor = &domain.CarCursor{CreatedAt: last.CreatedAt, Id: last.Id}
	}

	// Scoped to the same user as the page itself, so it can never report rows
	// the caller cannot see.
	if err := from(ctx, r.db).QueryRow(ctx, countCarsQuery, query.UserId).Scan(&page.Total); err != nil {
		return domain.CarPage{}, fmt.Errorf("count cars: %w", err)
	}

	return page, nil
}
