package car_test

import (
	"context"
	"errors"
	"fmt"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/stretchr/testify/require"

	"github.com/willikay11/wrench/api/internal/core/domain"
	"github.com/willikay11/wrench/api/internal/core/ports"
	"github.com/willikay11/wrench/api/internal/core/services/car"
)

/*
CreateCar hands the car to the repository and hands the result back. That is
the whole of it, so there are only two things to hold it to: the car reaches
the repository as the caller gave it, and a failure reaches the caller as the
repository raised it.

Which failure means what is decided elsewhere — carWriteError in
internal/postgres translates Postgres constraints into domain errors, and
carWriteProblem in internal/rest turns those into responses, both covered by
their own tests. Repeating that catalogue here would test the same pass-through
once per error value.
*/

// mockCarRepo records the car it was given, so a test can assert on what the
// service sent down rather than only on what came back.
type mockCarRepo struct {
	calls             int
	received          domain.Car
	receiveUpdatedCar domain.UpdateCar

	receivedQuery domain.CarQuery

	result domain.Car
	page   domain.CarPage
	err    error
}

func (m *mockCarRepo) Save(_ context.Context, car domain.Car) (domain.Car, error) {
	m.calls++
	m.received = car

	if m.err != nil {
		return domain.Car{}, m.err
	}
	return m.result, nil
}

func (m *mockCarRepo) List(_ context.Context, query domain.CarQuery) (domain.CarPage, error) {
	m.calls++
	m.receivedQuery = query

	if m.err != nil {
		return domain.CarPage{}, m.err
	}
	return m.page, nil
}

// GetForUpdate serves the stored car for updates that read before writing.
func (m *mockCarRepo) GetForUpdate(context.Context, uuid.UUID, uuid.UUID) (domain.Car, error) {
	if m.err != nil {
		return domain.Car{}, m.err
	}
	return m.result, nil
}

func (m *mockCarRepo) Update(_ context.Context, car domain.UpdateCar) (domain.Car, error) {
	m.calls++
	m.receiveUpdatedCar = car

	if m.err != nil {
		return domain.Car{}, m.err
	}
	return m.result, nil
}

type mockTxManager struct{}

func (m *mockTxManager) WithinTransaction(ctx context.Context, fn func(ctx context.Context) error) error {
	return fn(ctx)
}

// aCar is the input every test starts from. Built per call rather than shared,
// so no test can leave a mutation behind for the next one.
func aCar() domain.Car {
	return domain.Car{
		UserId:    uuid.New(),
		Make:      "Mitsubishi",
		Model:     "Evolution 10",
		Year:      2018,
		Engine:    "4B11T",
		UsageType: "weekend",
		Notes:     "Notes",
	}
}

// newService returns the service under test with a fresh repository, so each
// test owns its own mock and the order tests run in cannot matter. Typed as the
// port rather than the concrete service — NewService returns an unexported
// type, and the interface is what the handler actually depends on.
func newService(repo *mockCarRepo) ports.CarService {
	return car.NewService(repo, &fakeCatalogue{}, &mockTxManager{})
}

func TestCreateCarPassesTheCarToTheRepositoryUnchanged(t *testing.T) {
	input := aCar()

	// A distinct id on the way back, so returning the input by mistake and
	// returning the repository's row are telling apart.
	saved := input
	saved.Id = uuid.New()

	repo := &mockCarRepo{result: saved}

	got, err := newService(repo).CreateCar(t.Context(), input)

	require.NoError(t, err)
	// Every field, not just one: a service that dropped Notes or reset Year
	// would pass a single-field check.
	require.Equal(t, saved, got)

	// The one thing this service does: nothing is altered on the way down.
	require.Equal(t, 1, repo.calls)
	require.Equal(t, input, repo.received)
}

// The service does not inspect the error, only forward it — so one case covers
// the path, and it uses a wrapped error because that is the shape a repository
// returns once it adds context. errors.Is survives that; a comparison with ==
// would not.
func TestCreateCarForwardsRepositoryErrorsUnchanged(t *testing.T) {
	repo := &mockCarRepo{err: fmt.Errorf("create car entry: %w", domain.ErrInvalidUsageType)}

	got, err := newService(repo).CreateCar(t.Context(), aCar())

	require.ErrorIs(t, err, domain.ErrInvalidUsageType)
	// A failed create yields no car, so nothing half-built reaches the caller.
	require.Equal(t, domain.Car{}, got)
}

// A failure the repository did not classify must stay unclassified. If the
// service ever started substituting a domain error for an unknown one, the
// handler would report a rule the caller never broke.
func TestCreateCarDoesNotInventADomainErrorForAnUnknownFailure(t *testing.T) {
	failure := errors.New("dial tcp: connection refused")
	repo := &mockCarRepo{err: failure}

	_, err := newService(repo).CreateCar(t.Context(), aCar())

	require.ErrorIs(t, err, failure)
	for _, rule := range []error{
		domain.ErrInvalidUsageType,
		domain.ErrInvalidYear,
		domain.ErrMissingField,
		domain.ErrFieldTooLong,
		domain.ErrUnknownOwner,
	} {
		require.NotErrorIs(t, err, rule)
	}
}

// UpdateCar is the same pass-through as CreateCar, over the partial type: the
// update reaches the repository as the caller built it, and the repository's
// answer reaches the caller unchanged.
func TestUpdateCarPassesThePartialUpdateToTheRepository(t *testing.T) {
	update := domain.UpdateCar{
		Id:     uuid.New(),
		UserId: uuid.New(),
		Make:   ptr("Subaru"),
		Year:   ptr(2004),
		Notes:  domain.Nullable[string]{Sent: true, Value: nil},
	}
	stored := aCar()
	stored.Id = update.Id

	repo := &mockCarRepo{result: stored}

	got, err := newService(repo).UpdateCar(t.Context(), update)

	require.NoError(t, err)
	require.Equal(t, stored, got)

	require.Equal(t, 1, repo.calls)
	// Including the three-state notes, which is the field a pass-through is
	// most likely to flatten.
	require.Equal(t, update, repo.receiveUpdatedCar)
	require.True(t, repo.receiveUpdatedCar.Notes.Sent)
	require.Nil(t, repo.receiveUpdatedCar.Notes.Value)
}

func TestUpdateCarForwardsRepositoryErrorsUnchanged(t *testing.T) {
	for _, want := range []error{
		domain.ErrCarNotFound,
		domain.ErrNoFieldsToUpdate,
		domain.ErrInvalidUsageType,
	} {
		repo := &mockCarRepo{err: fmt.Errorf("update car entry: %w", want)}

		got, err := newService(repo).UpdateCar(t.Context(), domain.UpdateCar{Make: ptr("Subaru")})

		require.ErrorIs(t, err, want)
		require.Equal(t, domain.Car{}, got)
	}
}

func ptr[T any](v T) *T { return &v }

// ListCars is the same pass-through again: the validated query reaches the
// repository intact, and the page comes back unchanged.
func TestListCarsPassesTheQueryToTheRepository(t *testing.T) {
	owner := uuid.New()
	cursor := domain.CarCursor{CreatedAt: time.Now().UTC(), Id: uuid.New()}
	limit := 5

	query, err := domain.NewCarQuery(owner, &limit, &cursor)
	require.NoError(t, err)

	page := domain.CarPage{Cars: []domain.Car{aCar()}, HasMore: true, Total: 9, NextCursor: &cursor}
	repo := &mockCarRepo{page: page}

	got, err := newService(repo).ListCars(t.Context(), query)

	require.NoError(t, err)
	require.Equal(t, page, got)
	require.Equal(t, 1, repo.calls)
	require.Equal(t, query, repo.receivedQuery)
	// The owner in particular: a service that rebuilt the query could drop it.
	require.Equal(t, owner, repo.receivedQuery.UserId)
}

func TestListCarsForwardsRepositoryErrorsUnchanged(t *testing.T) {
	failure := errors.New("dial tcp: connection refused")
	repo := &mockCarRepo{err: failure}

	got, err := newService(repo).ListCars(t.Context(), domain.CarQuery{UserId: uuid.New(), Limit: 20})

	require.ErrorIs(t, err, failure)
	require.Equal(t, domain.CarPage{}, got)
}
