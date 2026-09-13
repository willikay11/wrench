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
	usageTypeConstraint  = "cars_usagetype_check"
	yearConstraint       = "cars_year_check"
	ownerConstraint      = "cars_userid_fkey"
	generationConstraint = "cars_generationid_fkey"
)

// carConstraintErrors maps each named constraint on cars to the domain error
// it stands for. Keyed by name rather than matched in a chain of ifs so that a
// constraint added to the table without a line here stays an unmapped 500 —
// loudly wrong — instead of quietly arriving as some neighbouring error.
var carConstraintErrors = map[string]error{
	usageTypeConstraint:  domain.ErrInvalidUsageType,
	yearConstraint:       domain.ErrInvalidYear,
	ownerConstraint:      domain.ErrUnknownOwner,
	generationConstraint: domain.ErrUnknownGeneration,
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

// createCarQuery inserts the car and reads the stored row back in one
// statement. The join supplies the body style from the linked generation, so
// the response is the database's answer: a bodyStyle a client sent is
// overwritten rather than echoed.
const createCarQuery = `
	WITH inserted AS (
		INSERT INTO cars (userId, make, model, year, engine, usageType, notes, generationId)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
		RETURNING id, createdAt, updatedAt, generationId
	)
	SELECT i.id, i.createdAt, i.updatedAt, i.generationId, g.bodyStyle
	FROM inserted i
	LEFT JOIN vehicleGenerations g ON g.id = i.generationId`

func (r *carRepo) Save(ctx context.Context, car domain.Car) (domain.Car, error) {
	ctx, cancel := context.WithTimeout(ctx, 5*time.Second)
	defer cancel()

	// The id, timestamps, link and body style all come back from the statement
	// rather than being guessed here, so the car returned is the row as stored.
	err := from(ctx, r.db).QueryRow(ctx, createCarQuery,
		car.UserId, car.Make, car.Model, car.Year, car.Engine, car.UsageType, car.Notes, car.GenerationId,
	).Scan(&car.Id, &car.CreatedAt, &car.UpdatedAt, &car.GenerationId, &car.BodyStyle)
	if err != nil {
		if mapped := carWriteError(err); mapped != nil {
			return domain.Car{}, mapped
		}
		return domain.Car{}, fmt.Errorf("create car entry: %w", err)
	}

	return car, nil
}

// The update names the owner as well as the id, so a car belonging to someone
// else matches no row — the same outcome as a car that does not exist, which is
// what keeps the endpoint from confirming that another user's id is real.
// COALESCE on the way out because notes is the one nullable column, while
// domain.Car carries it as a string.
const updateCarQuery = `
	WITH updated AS (
		UPDATE cars SET %s WHERE id = $%d AND userId = $%d
		RETURNING id, userId, make, model, year, engine, usageType,
		          COALESCE(notes, '') AS notes, createdAt, updatedAt, generationId
	)
	SELECT u.id, u.userId, u.make, u.model, u.year, u.engine, u.usageType,
	       u.notes, u.createdAt, u.updatedAt, u.generationId, g.bodyStyle
	FROM updated u
	LEFT JOIN vehicleGenerations g ON g.id = u.generationId`

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
	// Sent rather than non-nil, for the same reason: null unlinks the car.
	if updateCar.GenerationId.Sent {
		set("generationId", updateCar.GenerationId.Value)
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
		&car.GenerationId, &car.BodyStyle,
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
	SELECT c.id, c.userId, c.make, c.model, c.year, c.engine, c.usageType,
	       COALESCE(c.notes, ''), c.createdAt, c.updatedAt, c.generationId, g.bodyStyle
	FROM cars c
	LEFT JOIN vehicleGenerations g ON g.id = c.generationId
	WHERE c.userId = $1
	  AND ($2::timestamptz IS NULL OR (c.createdAt, c.id) < ($2::timestamptz, $3::uuid))
	ORDER BY c.createdAt DESC, c.id DESC
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
			&car.Engine, &car.UsageType, &car.Notes, &car.CreatedAt, &car.UpdatedAt,
			&car.GenerationId, &car.BodyStyle); err != nil {
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

// getCarForUpdateQuery reads one of the owner's cars. FOR UPDATE holds the row
// until the surrounding transaction ends, so a consistency check made against
// it cannot be overtaken by a concurrent edit before the write that follows.
// Outside a transaction the lock ends with the statement and costs nothing.
const getCarForUpdateQuery = `
	SELECT id, userId, make, model, year, engine, usageType,
	       COALESCE(notes, ''), createdAt, updatedAt, generationId
	FROM cars
	WHERE id = $1 AND userId = $2
	FOR UPDATE`

func (r *carRepo) GetForUpdate(ctx context.Context, id, userId uuid.UUID) (domain.Car, error) {
	ctx, cancel := context.WithTimeout(ctx, 5*time.Second)
	defer cancel()

	var car domain.Car
	err := from(ctx, r.db).QueryRow(ctx, getCarForUpdateQuery, id, userId).Scan(
		&car.Id, &car.UserId, &car.Make, &car.Model, &car.Year,
		&car.Engine, &car.UsageType, &car.Notes, &car.CreatedAt, &car.UpdatedAt, &car.GenerationId,
	)
	// Scoped by owner, so someone else's car is simply not found.
	if errors.Is(err, pgx.ErrNoRows) {
		return domain.Car{}, domain.ErrCarNotFound
	}
	if err != nil {
		return domain.Car{}, fmt.Errorf("get car: %w", err)
	}

	return car, nil
}
