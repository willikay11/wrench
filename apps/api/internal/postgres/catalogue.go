package postgres

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/willikay11/wrench/api/internal/core/domain"
)

type catalogueRepo struct {
	db *pgxpool.Pool
}

func NewCatalogueRepository(db *pgxpool.Pool) *catalogueRepo {
	return &catalogueRepo{db: db}
}

// likeEscaper makes search text match literally inside a LIKE pattern. Without
// it, a search for "%" matches every make and "_" matches any one character —
// the client's text would be read as pattern syntax rather than as text. The
// backslash is escaped first so an escaped character cannot be forged.
var likeEscaper = strings.NewReplacer(`\`, `\\`, `%`, `\%`, `_`, `\_`)

func escapeLike(text string) string {
	return likeEscaper.Replace(text)
}

// Search queries rank a name that starts with the text above one that merely
// contains it — "Nis" should offer Nissan before anything with "nis" inside —
// then fall back to alphabetical, with the id as a final tiebreak so the order
// is total. An empty search matches everything, alphabetically.
const searchMakesQuery = `
	SELECT id, name
	FROM vehicleMakes
	WHERE name ILIKE '%' || $1 || '%' ESCAPE '\'
	ORDER BY (name ILIKE $1 || '%' ESCAPE '\') DESC, lower(name), id
	LIMIT $2`

const searchModelsQuery = `
	SELECT id, makeId, name
	FROM vehicleModels
	WHERE makeId = $1
	  AND name ILIKE '%' || $2 || '%' ESCAPE '\'
	ORDER BY (name ILIKE $2 || '%' ESCAPE '\') DESC, lower(name), id
	LIMIT $3`

// A null endYear is a generation still in production, so it covers every year
// from its start.
const listGenerationsQuery = `
	SELECT id, modelId, code, startYear, endYear, bodyStyle,
	       imagePublicId, imageAttribution, imageLicense, imageSourceUrl
	FROM vehicleGenerations
	WHERE modelId = $1
	  AND ($2::int IS NULL
	       OR (startYear <= $2::int AND (endYear IS NULL OR endYear >= $2::int)))
	ORDER BY startYear, id`

const makeExistsQuery = `SELECT EXISTS (SELECT 1 FROM vehicleMakes WHERE id = $1)`
const modelExistsQuery = `SELECT EXISTS (SELECT 1 FROM vehicleModels WHERE id = $1)`

func (r *catalogueRepo) SearchMakes(ctx context.Context, search domain.CatalogueSearch) ([]domain.VehicleMake, error) {
	ctx, cancel := context.WithTimeout(ctx, 5*time.Second)
	defer cancel()

	rows, err := from(ctx, r.db).Query(ctx, searchMakesQuery, escapeLike(search.Text), search.Limit)
	if err != nil {
		return nil, fmt.Errorf("search makes: %w", err)
	}
	defer rows.Close()

	makes := make([]domain.VehicleMake, 0, search.Limit)
	for rows.Next() {
		var vehicleMake domain.VehicleMake
		if err := rows.Scan(&vehicleMake.Id, &vehicleMake.Name); err != nil {
			return nil, fmt.Errorf("scan make: %w", err)
		}
		makes = append(makes, vehicleMake)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("search makes: %w", err)
	}

	return makes, nil
}

func (r *catalogueRepo) SearchModels(ctx context.Context, makeId uuid.UUID, search domain.CatalogueSearch) ([]domain.VehicleModel, error) {
	ctx, cancel := context.WithTimeout(ctx, 5*time.Second)
	defer cancel()

	rows, err := from(ctx, r.db).Query(ctx, searchModelsQuery, makeId, escapeLike(search.Text), search.Limit)
	if err != nil {
		return nil, fmt.Errorf("search models: %w", err)
	}

	models := make([]domain.VehicleModel, 0, search.Limit)
	for rows.Next() {
		var model domain.VehicleModel
		if err := rows.Scan(&model.Id, &model.MakeId, &model.Name); err != nil {
			rows.Close()
			return nil, fmt.Errorf("scan model: %w", err)
		}
		models = append(models, model)
	}
	// Closed before the existence check: inside a transaction the connection
	// cannot run a second statement while these rows are still open.
	rows.Close()
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("search models: %w", err)
	}

	// No results means either nothing matched or there is no such make, and
	// only the second is a 404. Checked only when empty, so a search that finds
	// something costs one round trip.
	if len(models) == 0 {
		if err := r.mustExist(ctx, makeExistsQuery, makeId, domain.ErrMakeNotFound); err != nil {
			return nil, err
		}
	}

	return models, nil
}

func (r *catalogueRepo) ListGenerations(ctx context.Context, modelId uuid.UUID, year *int) ([]domain.VehicleGeneration, error) {
	ctx, cancel := context.WithTimeout(ctx, 5*time.Second)
	defer cancel()

	rows, err := from(ctx, r.db).Query(ctx, listGenerationsQuery, modelId, year)
	if err != nil {
		return nil, fmt.Errorf("list generations: %w", err)
	}

	generations := make([]domain.VehicleGeneration, 0)
	for rows.Next() {
		var generation domain.VehicleGeneration
		var publicId, attribution, license, sourceUrl *string

		if err := rows.Scan(
			&generation.Id, &generation.ModelId, &generation.Code,
			&generation.StartYear, &generation.EndYear, &generation.BodyStyle,
			&publicId, &attribution, &license, &sourceUrl,
		); err != nil {
			rows.Close()
			return nil, fmt.Errorf("scan generation: %w", err)
		}

		if publicId != nil {
			generation.Image = &domain.CatalogueImage{
				PublicId:    *publicId,
				Attribution: valueOf(attribution),
				License:     valueOf(license),
				SourceUrl:   valueOf(sourceUrl),
			}
		}

		generations = append(generations, generation)
	}
	rows.Close()
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("list generations: %w", err)
	}

	// An empty list for a real model is ordinary — a rare car, or a year no
	// generation covers. Only a model that does not exist is a 404.
	if len(generations) == 0 {
		if err := r.mustExist(ctx, modelExistsQuery, modelId, domain.ErrModelNotFound); err != nil {
			return nil, err
		}
	}

	return generations, nil
}

// mustExist returns notFound when the row does not exist.
func (r *catalogueRepo) mustExist(ctx context.Context, query string, id uuid.UUID, notFound error) error {
	var exists bool
	if err := from(ctx, r.db).QueryRow(ctx, query, id).Scan(&exists); err != nil {
		return fmt.Errorf("check existence: %w", err)
	}
	if !exists {
		return notFound
	}
	return nil
}

func valueOf(s *string) string {
	if s == nil {
		return ""
	}
	return *s
}

const findGenerationQuery = `
	SELECT g.id, g.modelId, g.code, g.startYear, g.endYear, g.bodyStyle, mo.name, ma.name
	FROM vehicleGenerations g
	JOIN vehicleModels mo ON mo.id = g.modelId
	JOIN vehicleMakes ma  ON ma.id = mo.makeId
	WHERE g.id = $1`

func (r *catalogueRepo) FindGeneration(ctx context.Context, id uuid.UUID) (domain.GenerationMatch, error) {
	ctx, cancel := context.WithTimeout(ctx, 5*time.Second)
	defer cancel()

	var match domain.GenerationMatch
	err := from(ctx, r.db).QueryRow(ctx, findGenerationQuery, id).Scan(
		&match.Generation.Id, &match.Generation.ModelId, &match.Generation.Code,
		&match.Generation.StartYear, &match.Generation.EndYear, &match.Generation.BodyStyle,
		&match.ModelName, &match.MakeName,
	)
	if errors.Is(err, pgx.ErrNoRows) {
		return domain.GenerationMatch{}, domain.ErrUnknownGeneration
	}
	if err != nil {
		return domain.GenerationMatch{}, fmt.Errorf("find generation: %w", err)
	}

	return match, nil
}
