package car_test

import (
	"context"
	"errors"
	"testing"

	"github.com/google/uuid"
	"github.com/stretchr/testify/require"

	"github.com/willikay11/wrench/api/internal/core/domain"
	"github.com/willikay11/wrench/api/internal/core/ports"
	"github.com/willikay11/wrench/api/internal/core/services/car"
)

/*
A car may link to a catalogue generation, and while it does its make, model and
year must agree with it. These tests hold the service to that on create and on
every update that could break it, and to the order of checks on update:
ownership first, so the catalogue is never consulted for someone else's car.
*/

type fakeCatalogue struct {
	matches map[uuid.UUID]domain.GenerationMatch
	finds   int
}

func (f *fakeCatalogue) SearchMakes(context.Context, domain.CatalogueSearch) ([]domain.VehicleMake, error) {
	return nil, nil
}

func (f *fakeCatalogue) SearchModels(context.Context, uuid.UUID, domain.CatalogueSearch) ([]domain.VehicleModel, error) {
	return nil, nil
}

func (f *fakeCatalogue) ListGenerations(context.Context, uuid.UUID, *int) ([]domain.VehicleGeneration, error) {
	return nil, nil
}

func (f *fakeCatalogue) FindGeneration(_ context.Context, id uuid.UUID) (domain.GenerationMatch, error) {
	f.finds++
	match, ok := f.matches[id]
	if !ok {
		return domain.GenerationMatch{}, domain.ErrUnknownGeneration
	}
	return match, nil
}

// linkRepo holds one stored car, for the update paths that read before writing.
type linkRepo struct {
	current domain.Car
	getErr  error
	gets    int

	saved   *domain.Car
	updated *domain.UpdateCar
}

func (r *linkRepo) Save(_ context.Context, c domain.Car) (domain.Car, error) {
	r.saved = &c
	return c, nil
}

func (r *linkRepo) Update(_ context.Context, u domain.UpdateCar) (domain.Car, error) {
	r.updated = &u
	return r.current, nil
}

func (r *linkRepo) List(context.Context, domain.CarQuery) (domain.CarPage, error) {
	return domain.CarPage{}, nil
}

func (r *linkRepo) GetForUpdate(context.Context, uuid.UUID, uuid.UUID) (domain.Car, error) {
	r.gets++
	return r.current, r.getErr
}

// newLinkService builds the service with no media storage: a car's link does
// not depend on its photo.
func newLinkService(repo ports.CarRepository, catalogue ports.CatalogueRepository, tx ports.TxManager) ports.CarService {
	return car.NewService(repo, catalogue, nil, nil, tx)
}

type txRecorder struct{ transactions int }

func (t *txRecorder) WithinTransaction(ctx context.Context, fn func(context.Context) error) error {
	t.transactions++
	return fn(ctx)
}

func generation(makeName, modelName string, start int, end *int) (uuid.UUID, domain.GenerationMatch) {
	id := uuid.New()
	return id, domain.GenerationMatch{
		Generation: domain.VehicleGeneration{Id: id, StartYear: start, EndYear: end, BodyStyle: "coupe"},
		MakeName:   makeName,
		ModelName:  modelName,
	}
}

func endingIn(year int) *int { return &year }

func mismatchFields(t *testing.T, err error) []string {
	t.Helper()

	var mismatch *domain.GenerationMismatchError
	require.True(t, errors.As(err, &mismatch), "want a GenerationMismatchError, got %v", err)
	return mismatch.Fields
}

func TestCreateCarLinksWhenTheCarAgreesWithTheGeneration(t *testing.T) {
	z33, match := generation("Nissan", "350Z", 2002, endingIn(2009))
	catalogue := &fakeCatalogue{matches: map[uuid.UUID]domain.GenerationMatch{z33: match}}
	repo := &linkRepo{}

	_, err := newLinkService(repo, catalogue, &txRecorder{}).CreateCar(t.Context(), domain.Car{
		Make: "nissan", Model: "350Z", Year: 2005, GenerationId: &z33,
	})

	require.NoError(t, err)
	require.NotNil(t, repo.saved)
	require.Equal(t, 1, catalogue.finds)
}

func TestCreateCarRefusesACarThatDisagreesWithItsGeneration(t *testing.T) {
	z33, match := generation("Nissan", "350Z", 2002, endingIn(2009))

	cases := []struct {
		name  string
		car   domain.Car
		wants []string
	}{
		{name: "another make", car: domain.Car{Make: "Subaru", Model: "350Z", Year: 2005}, wants: []string{"make"}},
		{name: "another model", car: domain.Car{Make: "Nissan", Model: "370Z", Year: 2005}, wants: []string{"model"}},
		{name: "a year outside it", car: domain.Car{Make: "Nissan", Model: "350Z", Year: 2012}, wants: []string{"year"}},
		{name: "all three", car: domain.Car{Make: "Mazda", Model: "RX-7", Year: 1993}, wants: []string{"make", "model", "year"}},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			repo := &linkRepo{}
			tc.car.GenerationId = &z33

			_, err := newLinkService(repo,
				&fakeCatalogue{matches: map[uuid.UUID]domain.GenerationMatch{z33: match}},
				&txRecorder{},
			).CreateCar(t.Context(), tc.car)

			require.Equal(t, tc.wants, mismatchFields(t, err))
			require.Nil(t, repo.saved, "a mismatched car must not be saved")
		})
	}
}

func TestCreateCarRefusesAnUnknownGeneration(t *testing.T) {
	repo := &linkRepo{}

	_, err := newLinkService(repo, &fakeCatalogue{}, &txRecorder{}).CreateCar(t.Context(), domain.Car{
		Make: "Nissan", Model: "350Z", Year: 2005, GenerationId: ptr(uuid.New()),
	})

	require.ErrorIs(t, err, domain.ErrUnknownGeneration)
	require.Nil(t, repo.saved)
}

// Free-text cars stay first-class, and cost nothing extra.
func TestCreateCarWithoutALinkNeverAsksTheCatalogue(t *testing.T) {
	catalogue := &fakeCatalogue{}
	repo := &linkRepo{}

	_, err := newLinkService(repo, catalogue, &txRecorder{}).CreateCar(t.Context(), domain.Car{
		Make: "Kit", Model: "Car", Year: 2005,
	})

	require.NoError(t, err)
	require.NotNil(t, repo.saved)
	require.Zero(t, catalogue.finds)
}

func TestUpdateCarChecksANewLinkAgainstTheStoredCar(t *testing.T) {
	z33, match := generation("Nissan", "350Z", 2002, endingIn(2009))
	catalogue := &fakeCatalogue{matches: map[uuid.UUID]domain.GenerationMatch{z33: match}}
	repo := &linkRepo{current: domain.Car{Make: "Nissan", Model: "350Z", Year: 2005}}

	_, err := newLinkService(repo, catalogue, &txRecorder{}).UpdateCar(t.Context(), domain.UpdateCar{
		GenerationId: domain.Nullable[uuid.UUID]{Sent: true, Value: &z33},
	})

	require.NoError(t, err)
	require.Equal(t, 1, catalogue.finds)
	require.NotNil(t, repo.updated)
}

// The body names only the year; the stored make and model fill in the rest.
func TestUpdateCarRefusesAYearThatBreaksTheExistingLink(t *testing.T) {
	z33, match := generation("Nissan", "350Z", 2002, endingIn(2009))
	repo := &linkRepo{current: domain.Car{Make: "Nissan", Model: "350Z", Year: 2005, GenerationId: &z33}}

	_, err := newLinkService(repo,
		&fakeCatalogue{matches: map[uuid.UUID]domain.GenerationMatch{z33: match}},
		&txRecorder{},
	).UpdateCar(t.Context(), domain.UpdateCar{Year: ptr(2015)})

	require.Equal(t, []string{"year"}, mismatchFields(t, err))
	require.Nil(t, repo.updated)
}

// Unlinking in the same request is the way to make a change the link forbids.
func TestUpdateCarAllowsABreakingChangeWhenTheSameRequestUnlinks(t *testing.T) {
	z33, match := generation("Nissan", "350Z", 2002, endingIn(2009))
	catalogue := &fakeCatalogue{matches: map[uuid.UUID]domain.GenerationMatch{z33: match}}
	repo := &linkRepo{current: domain.Car{Make: "Nissan", Model: "350Z", Year: 2005, GenerationId: &z33}}

	_, err := newLinkService(repo, catalogue, &txRecorder{}).UpdateCar(t.Context(), domain.UpdateCar{
		Year:         ptr(2015),
		GenerationId: domain.Nullable[uuid.UUID]{Sent: true, Value: nil},
	})

	require.NoError(t, err)
	require.Zero(t, catalogue.finds, "an unlinked car has nothing to agree with")
	require.NotNil(t, repo.updated)
}

// Relinking checks the new generation against the new values, not the old.
func TestUpdateCarRelinksAgainstTheValuesItIsWriting(t *testing.T) {
	z33, z33Match := generation("Nissan", "350Z", 2002, endingIn(2009))
	z34, z34Match := generation("Nissan", "370Z", 2009, endingIn(2020))
	catalogue := &fakeCatalogue{matches: map[uuid.UUID]domain.GenerationMatch{z33: z33Match, z34: z34Match}}
	repo := &linkRepo{current: domain.Car{Make: "Nissan", Model: "350Z", Year: 2005, GenerationId: &z33}}

	_, err := newLinkService(repo, catalogue, &txRecorder{}).UpdateCar(t.Context(), domain.UpdateCar{
		Model:        ptr("370Z"),
		Year:         ptr(2012),
		GenerationId: domain.Nullable[uuid.UUID]{Sent: true, Value: &z34},
	})

	require.NoError(t, err)
	require.NotNil(t, repo.updated)
}

// The IDOR property: nothing about a generation, or whether a link would have
// been valid, is revealed for a car the caller does not own.
func TestUpdateCarOnSomeoneElsesCarIsNotFoundBeforeTheCatalogueIsAsked(t *testing.T) {
	z33, match := generation("Nissan", "350Z", 2002, endingIn(2009))
	catalogue := &fakeCatalogue{matches: map[uuid.UUID]domain.GenerationMatch{z33: match}}
	repo := &linkRepo{getErr: domain.ErrCarNotFound}

	_, err := newLinkService(repo, catalogue, &txRecorder{}).UpdateCar(t.Context(), domain.UpdateCar{
		GenerationId: domain.Nullable[uuid.UUID]{Sent: true, Value: &z33},
	})

	require.ErrorIs(t, err, domain.ErrCarNotFound)
	require.Zero(t, catalogue.finds)
	require.Nil(t, repo.updated)
}

func TestUpdateCarThatCannotAffectALinkSkipsTheReadAndTheTransaction(t *testing.T) {
	repo := &linkRepo{}
	tx := &txRecorder{}

	_, err := newLinkService(repo, &fakeCatalogue{}, tx).UpdateCar(t.Context(), domain.UpdateCar{
		Engine: ptr("V8"),
		Notes:  domain.Nullable[string]{Sent: true, Value: ptr("stage 2")},
	})

	require.NoError(t, err)
	require.Zero(t, repo.gets)
	require.Zero(t, tx.transactions)
	require.NotNil(t, repo.updated)
}

func TestUpdateCarReadsChecksAndWritesInOneTransaction(t *testing.T) {
	z33, match := generation("Nissan", "350Z", 2002, endingIn(2009))
	repo := &linkRepo{current: domain.Car{Make: "Nissan", Model: "350Z", Year: 2005, GenerationId: &z33}}
	tx := &txRecorder{}

	_, err := newLinkService(repo,
		&fakeCatalogue{matches: map[uuid.UUID]domain.GenerationMatch{z33: match}},
		tx,
	).UpdateCar(t.Context(), domain.UpdateCar{Year: ptr(2006)})

	require.NoError(t, err)
	require.Equal(t, 1, tx.transactions)
	require.Equal(t, 1, repo.gets)
	require.NotNil(t, repo.updated)
}
