package car_test

import (
	"context"
	"errors"
	"fmt"
	"testing"

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
	calls    int
	received domain.Car

	result domain.Car
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
	return car.NewService(repo, &mockTxManager{})
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
