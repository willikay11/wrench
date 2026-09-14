package postgres

import (
	"context"
	"strings"
	"testing"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/stretchr/testify/require"

	"github.com/willikay11/wrench/api/internal/core/domain"
)

/*
The catalogue shares its tables with the starter seed, so every test works on
makes named with a random token and removes them afterwards. Assertions are
written against those rows — or, where a search spans the whole table, against
a property every result must have — so they hold however the seed grows.
*/

// token is unique per test so searches cannot collide with the seed or with
// each other.
func token() string {
	return "zq" + strings.ReplaceAll(uuid.NewString()[:8], "-", "")
}

func aMake(t *testing.T, pool *pgxpool.Pool, name string) uuid.UUID {
	t.Helper()

	var id uuid.UUID
	require.NoError(t, pool.QueryRow(context.Background(),
		`INSERT INTO vehicleMakes (name) VALUES ($1) RETURNING id`, name).Scan(&id))

	t.Cleanup(func() {
		pool.Exec(context.Background(), `DELETE FROM vehicleMakes WHERE id = $1`, id)
	})

	return id
}

func aModel(t *testing.T, pool *pgxpool.Pool, makeId uuid.UUID, name string) uuid.UUID {
	t.Helper()

	var id uuid.UUID
	require.NoError(t, pool.QueryRow(context.Background(),
		`INSERT INTO vehicleModels (makeId, name) VALUES ($1, $2) RETURNING id`, makeId, name).Scan(&id))

	return id
}

func aGeneration(t *testing.T, pool *pgxpool.Pool, modelId uuid.UUID, start int, end *int) uuid.UUID {
	t.Helper()

	var id uuid.UUID
	require.NoError(t, pool.QueryRow(context.Background(),
		`INSERT INTO vehicleGenerations (modelId, startYear, endYear, bodyStyle)
		 VALUES ($1, $2, $3, 'coupe') RETURNING id`, modelId, start, end).Scan(&id))

	return id
}

func search(t *testing.T, text string, limit ...int) domain.CatalogueSearch {
	t.Helper()

	var size *int
	if len(limit) > 0 {
		size = &limit[0]
	}

	s, err := domain.NewCatalogueSearch(text, size)
	require.NoError(t, err)

	return s
}

func TestSearchMakesRanksPrefixMatchesFirst(t *testing.T) {
	pool := withDB(t)
	repo := NewCatalogueRepository(pool)
	tok := token()

	// Alphabetically "Alpha…" sorts first, so ranking has to beat that.
	contains := aMake(t, pool, "Alpha"+tok)
	prefix := aMake(t, pool, tok+"Motors")

	makes, err := repo.SearchMakes(t.Context(), search(t, tok))
	require.NoError(t, err)
	require.Len(t, makes, 2)

	require.Equal(t, prefix, makes[0].Id, "a name starting with the text must come first")
	require.Equal(t, contains, makes[1].Id)
}

func TestSearchMakesIsCaseInsensitive(t *testing.T) {
	pool := withDB(t)
	repo := NewCatalogueRepository(pool)
	tok := token()

	id := aMake(t, pool, strings.ToUpper(tok)+"Works")

	makes, err := repo.SearchMakes(t.Context(), search(t, strings.ToLower(tok)))
	require.NoError(t, err)
	require.Len(t, makes, 1)
	require.Equal(t, id, makes[0].Id)
}

// The injection this guards against is small but real: without escaping, "%"
// returns the whole table and "_" matches any single character.
func TestSearchMakesTreatsPatternCharactersAsText(t *testing.T) {
	pool := withDB(t)
	repo := NewCatalogueRepository(pool)
	tok := token()

	aMake(t, pool, "100%"+tok)
	aMake(t, pool, "a_b"+tok)
	aMake(t, pool, "axb"+tok)

	percent, err := repo.SearchMakes(t.Context(), search(t, "%", domain.MaxCatalogueResults))
	require.NoError(t, err)
	require.NotEmpty(t, percent)
	for _, m := range percent {
		require.Contains(t, m.Name, "%", "%% matched %q as a wildcard", m.Name)
	}

	underscore, err := repo.SearchMakes(t.Context(), search(t, "a_b"+tok))
	require.NoError(t, err)
	require.Len(t, underscore, 1, `"_" must not also match "axb"`)
	require.Equal(t, "a_b"+tok, underscore[0].Name)
}

func TestSearchMakesHonoursTheLimit(t *testing.T) {
	pool := withDB(t)
	repo := NewCatalogueRepository(pool)
	tok := token()

	for i := 0; i < 3; i++ {
		aMake(t, pool, tok+string(rune('a'+i)))
	}

	makes, err := repo.SearchMakes(t.Context(), search(t, tok, 2))
	require.NoError(t, err)
	require.Len(t, makes, 2)
}

func TestSearchModelsIsScopedToItsMake(t *testing.T) {
	pool := withDB(t)
	repo := NewCatalogueRepository(pool)
	tok := token()

	mine := aMake(t, pool, "Mine"+tok)
	other := aMake(t, pool, "Other"+tok)
	wanted := aModel(t, pool, mine, tok+"Coupe")
	aModel(t, pool, other, tok+"Coupe")

	models, err := repo.SearchModels(t.Context(), mine, search(t, tok))
	require.NoError(t, err)
	require.Len(t, models, 1, "another make's model with the same name leaked in")
	require.Equal(t, wanted, models[0].Id)
	require.Equal(t, mine, models[0].MakeId)
}

// Nothing matching is ordinary; a make that does not exist is not.
func TestSearchModelsDistinguishesNoMatchFromNoMake(t *testing.T) {
	pool := withDB(t)
	repo := NewCatalogueRepository(pool)
	tok := token()

	real := aMake(t, pool, "Real"+tok)

	models, err := repo.SearchModels(t.Context(), real, search(t, "nothing-called-this"))
	require.NoError(t, err)
	require.Empty(t, models)

	_, err = repo.SearchModels(t.Context(), uuid.New(), search(t, ""))
	require.ErrorIs(t, err, domain.ErrMakeNotFound)
}

func TestListGenerationsFiltersByYear(t *testing.T) {
	pool := withDB(t)
	repo := NewCatalogueRepository(pool)
	tok := token()

	model := aModel(t, pool, aMake(t, pool, "Gen"+tok), "Model"+tok)
	end := 2009
	first := aGeneration(t, pool, model, 2002, &end)
	ongoing := aGeneration(t, pool, model, 2015, nil)

	cases := []struct {
		year int
		want []uuid.UUID
	}{
		{year: 2001, want: nil},
		{year: 2002, want: []uuid.UUID{first}},
		{year: 2009, want: []uuid.UUID{first}},
		{year: 2012, want: nil},
		{year: 2015, want: []uuid.UUID{ongoing}},
		// A null endYear is still in production, not a missing value.
		{year: domain.MaxCarYear, want: []uuid.UUID{ongoing}},
	}

	for _, tc := range cases {
		year := tc.year
		generations, err := repo.ListGenerations(t.Context(), model, &year)
		require.NoError(t, err, "year %d", tc.year)

		var got []uuid.UUID
		for _, g := range generations {
			got = append(got, g.Id)
		}
		require.Equal(t, tc.want, got, "year %d", tc.year)
	}

	all, err := repo.ListGenerations(t.Context(), model, nil)
	require.NoError(t, err)
	require.Len(t, all, 2, "no year means every generation, oldest first")
	require.Equal(t, first, all[0].Id)
}

func TestListGenerationsOfAnUnknownModelIsNotFound(t *testing.T) {
	pool := withDB(t)
	repo := NewCatalogueRepository(pool)

	_, err := repo.ListGenerations(t.Context(), uuid.New(), nil)
	require.ErrorIs(t, err, domain.ErrModelNotFound)
}

// Each of these is a rule the application also enforces, held again by the
// database so a bad row cannot arrive by some other path.
func TestCatalogueConstraintsRefuseBadRows(t *testing.T) {
	pool := withDB(t)
	tok := token()

	makeId := aMake(t, pool, "Constraint"+tok)
	modelId := aModel(t, pool, makeId, "Model"+tok)

	cases := []struct {
		name       string
		statement  string
		args       []any
		constraint string
	}{
		{
			name:       "a generation ending before it starts",
			statement:  `INSERT INTO vehicleGenerations (modelId, startYear, endYear, bodyStyle) VALUES ($1, 2010, 2009, 'coupe')`,
			args:       []any{modelId},
			constraint: "vehiclegenerations_year_order",
		},
		{
			name:       "a year before the first car",
			statement:  `INSERT INTO vehicleGenerations (modelId, startYear, bodyStyle) VALUES ($1, 1884, 'coupe')`,
			args:       []any{modelId},
			constraint: "vehiclegenerations_startyear_check",
		},
		{
			name:       "a body style the catalogue does not allow",
			statement:  `INSERT INTO vehicleGenerations (modelId, startYear, bodyStyle) VALUES ($1, 2010, 'spaceship')`,
			args:       []any{modelId},
			constraint: "vehiclegenerations_bodystyle_check",
		},
		{
			name:       "an image with no attribution",
			statement:  `INSERT INTO vehicleGenerations (modelId, startYear, bodyStyle, imagePublicId) VALUES ($1, 2010, 'coupe', 'wrench/catalogue/x')`,
			args:       []any{modelId},
			constraint: "vehiclegenerations_image_attributed",
		},
		{
			name:       "the same model name under one make, differently cased",
			statement:  `INSERT INTO vehicleModels (makeId, name) VALUES ($1, $2)`,
			args:       []any{makeId, strings.ToUpper("Model" + tok)},
			constraint: "uq_vehiclemodels_make_name",
		},
		{
			name:       "the same make name, differently cased",
			statement:  `INSERT INTO vehicleMakes (name) VALUES ($1)`,
			args:       []any{strings.ToUpper("Constraint" + tok)},
			constraint: "uq_vehiclemakes_name",
		},
		{
			name:       "a blank make name",
			statement:  `INSERT INTO vehicleMakes (name) VALUES ('   ')`,
			constraint: "vehiclemakes_name_check",
		},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			_, err := pool.Exec(t.Context(), tc.statement, tc.args...)
			require.Error(t, err)
			require.Contains(t, err.Error(), tc.constraint)
		})
	}
}

// The seed is data other work depends on; this checks it arrived and that one
// well-known entry resolves the way the add-car sheet will ask for it.
func TestStarterSeedResolvesAKnownCar(t *testing.T) {
	pool := withDB(t)
	repo := NewCatalogueRepository(pool)

	makes, err := repo.SearchMakes(t.Context(), search(t, "Nissan"))
	require.NoError(t, err)
	require.NotEmpty(t, makes)
	require.Equal(t, "Nissan", makes[0].Name)

	models, err := repo.SearchModels(t.Context(), makes[0].Id, search(t, "350Z"))
	require.NoError(t, err)
	require.Len(t, models, 1)

	year := 2003
	generations, err := repo.ListGenerations(t.Context(), models[0].Id, &year)
	require.NoError(t, err)
	require.Len(t, generations, 1)
	require.Equal(t, "Z33", *generations[0].Code)
	require.Equal(t, "coupe", generations[0].BodyStyle)
	require.Nil(t, generations[0].Image, "the seed carries no images")
}

func TestFindGenerationCarriesItsMakeAndModelNames(t *testing.T) {
	pool := withDB(t)
	repo := NewCatalogueRepository(pool)
	tok := token()

	makeName, modelName := "Find"+tok, "Model"+tok
	end := 2009
	id := aGeneration(t, pool, aModel(t, pool, aMake(t, pool, makeName), modelName), 2002, &end)

	match, err := repo.FindGeneration(t.Context(), id)

	require.NoError(t, err)
	require.Equal(t, makeName, match.MakeName)
	require.Equal(t, modelName, match.ModelName)
	require.Equal(t, id, match.Generation.Id)
	require.Equal(t, 2002, match.Generation.StartYear)
	require.Equal(t, 2009, *match.Generation.EndYear)
	require.Equal(t, "coupe", match.Generation.BodyStyle)
}

func TestFindGenerationOfAnUnknownIdIsUnknownGeneration(t *testing.T) {
	pool := withDB(t)
	repo := NewCatalogueRepository(pool)

	_, err := repo.FindGeneration(t.Context(), uuid.New())
	require.ErrorIs(t, err, domain.ErrUnknownGeneration)
}
