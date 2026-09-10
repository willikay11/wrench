package postgres

import (
	"context"
	"os"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/stretchr/testify/require"

	"github.com/willikay11/wrench/api/internal/core/domain"
)

/*
The rest of this package's tests are pure functions over pgconn errors. These
run the statements themselves, because the properties they cover are properties
of the SQL — which rows an UPDATE matches, which columns it leaves alone, and
what NOW() and COALESCE do — and a mocked database would only restate the
assumptions being tested.

They need a migrated database in DATABASE_URL and skip without one, so a
checkout with no database still runs a green suite.
*/

// withDB returns a pool against the configured database, or skips.
func withDB(t *testing.T) *pgxpool.Pool {
	t.Helper()

	dsn := os.Getenv("DATABASE_URL")
	if dsn == "" {
		t.Skip("DATABASE_URL is not set — skipping the database integration tests")
	}

	pool, err := pgxpool.New(context.Background(), dsn)
	require.NoError(t, err)
	require.NoError(t, pool.Ping(context.Background()), "DATABASE_URL is set but unreachable")

	t.Cleanup(pool.Close)

	return pool
}

// twoUsers creates a pair of real users and removes them afterwards. Cars
// cascade from users, so deleting these takes their cars with them and no test
// leaves rows behind.
func twoUsers(t *testing.T, pool *pgxpool.Pool) (alice, bob uuid.UUID) {
	t.Helper()

	alice, bob = uuid.New(), uuid.New()
	for _, id := range []uuid.UUID{alice, bob} {
		_, err := pool.Exec(context.Background(),
			`INSERT INTO users (id, email, displayName, status) VALUES ($1, $2, 'Test', 'active')`,
			id, id.String()+"@example.test")
		require.NoError(t, err)
	}

	t.Cleanup(func() {
		pool.Exec(context.Background(), `DELETE FROM users WHERE id = ANY($1)`, []uuid.UUID{alice, bob})
	})

	return alice, bob
}

func ptr[T any](v T) *T { return &v }

// sentNotes is a notes field the body carried; nil value means it was null.
func sentNotes(value *string) domain.Nullable[string] {
	return domain.Nullable[string]{Sent: true, Value: value}
}

func aSavedCar(t *testing.T, repo *carRepo, owner uuid.UUID) domain.Car {
	t.Helper()

	car, err := repo.Save(context.Background(), domain.Car{
		UserId: owner, Make: "Mitsubishi", Model: "Evolution 10", Year: 2018,
		Engine: "4B11T", UsageType: "weekend", Notes: "original notes",
	})
	require.NoError(t, err)

	return car
}

// The IDOR test the standards require of every endpoint: one user's id against
// another user's car. The update is scoped by owner in SQL, so the row never
// matches — and the answer is "not found", which does not confirm the id exists.
func TestUpdateCannotReachAnotherUsersCar(t *testing.T) {
	pool := withDB(t)
	alice, bob := twoUsers(t, pool)
	repo := NewCarRepository(pool)

	bobsCar := aSavedCar(t, repo, bob)

	_, err := repo.Update(t.Context(), domain.UpdateCar{
		Id: bobsCar.Id, UserId: alice, Make: ptr("Subaru"), Notes: sentNotes(nil),
	})
	require.ErrorIs(t, err, domain.ErrCarNotFound)

	// Refused is not enough: the row must be exactly as Bob left it.
	var make, notes string
	var updatedAt time.Time
	require.NoError(t, pool.QueryRow(t.Context(),
		`SELECT make, COALESCE(notes,''), updatedAt FROM cars WHERE id = $1`, bobsCar.Id).
		Scan(&make, &notes, &updatedAt))

	require.Equal(t, bobsCar.Make, make)
	require.Equal(t, bobsCar.Notes, notes)
	require.True(t, updatedAt.Equal(bobsCar.UpdatedAt), "updatedAt moved on a refused update")
}

// A car nobody owns answers the same as a car someone else owns, so nothing in
// the response separates "does not exist" from "not yours".
func TestUpdateOfAnUnknownCarIsNotFound(t *testing.T) {
	pool := withDB(t)
	alice, _ := twoUsers(t, pool)
	repo := NewCarRepository(pool)

	_, err := repo.Update(t.Context(), domain.UpdateCar{
		Id: uuid.New(), UserId: alice, Make: ptr("Subaru"),
	})
	require.ErrorIs(t, err, domain.ErrCarNotFound)
}

func TestUpdateWritesOnlyTheFieldsTheBodyNamed(t *testing.T) {
	pool := withDB(t)
	alice, _ := twoUsers(t, pool)
	repo := NewCarRepository(pool)

	car := aSavedCar(t, repo, alice)
	// NOW() has microsecond resolution; without this the two stamps can land
	// in the same instant and the "advanced" assertion would be flaky.
	time.Sleep(5 * time.Millisecond)

	got, err := repo.Update(t.Context(), domain.UpdateCar{
		Id: car.Id, UserId: alice, UsageType: ptr("track"),
	})
	require.NoError(t, err)

	require.Equal(t, "track", got.UsageType)
	// Every other column, byte for byte. The bug this catches assigned the new
	// usage type to model.
	require.Equal(t, car.Make, got.Make)
	require.Equal(t, car.Model, got.Model)
	require.Equal(t, car.Year, got.Year)
	require.Equal(t, car.Engine, got.Engine)
	require.Equal(t, car.Notes, got.Notes)
	require.Equal(t, car.UserId, got.UserId)
	require.Equal(t, car.Id, got.Id)

	require.True(t, car.CreatedAt.Equal(got.CreatedAt), "createdAt must not move")
	require.True(t, got.UpdatedAt.After(car.UpdatedAt), "updatedAt must advance")
}

// The tri-state, which is the whole reason notes is a Nullable and not a
// pointer: null clears the column, and an omitted notes leaves it alone.
func TestUpdateDistinguishesClearedNotesFromOmittedNotes(t *testing.T) {
	pool := withDB(t)
	alice, _ := twoUsers(t, pool)
	repo := NewCarRepository(pool)

	car := aSavedCar(t, repo, alice)

	cleared, err := repo.Update(t.Context(), domain.UpdateCar{
		Id: car.Id, UserId: alice, Notes: sentNotes(nil),
	})
	require.NoError(t, err)
	require.Empty(t, cleared.Notes)

	// Cleared to SQL NULL, not to the empty string.
	var isNull bool
	require.NoError(t, pool.QueryRow(t.Context(), `SELECT notes IS NULL FROM cars WHERE id = $1`, car.Id).Scan(&isNull))
	require.True(t, isNull)

	restored, err := repo.Update(t.Context(), domain.UpdateCar{
		Id: car.Id, UserId: alice, Notes: sentNotes(ptr("back again")),
	})
	require.NoError(t, err)
	require.Equal(t, "back again", restored.Notes)

	// A body that does not mention notes must not disturb them.
	untouched, err := repo.Update(t.Context(), domain.UpdateCar{
		Id: car.Id, UserId: alice, Make: ptr("Subaru"),
	})
	require.NoError(t, err)
	require.Equal(t, "back again", untouched.Notes)
}

func TestUpdateWithNoFieldsIsRefusedBeforeAnythingIsWritten(t *testing.T) {
	pool := withDB(t)
	alice, _ := twoUsers(t, pool)
	repo := NewCarRepository(pool)

	car := aSavedCar(t, repo, alice)

	_, err := repo.Update(t.Context(), domain.UpdateCar{Id: car.Id, UserId: alice})
	require.ErrorIs(t, err, domain.ErrNoFieldsToUpdate)

	var updatedAt time.Time
	require.NoError(t, pool.QueryRow(t.Context(), `SELECT updatedAt FROM cars WHERE id = $1`, car.Id).Scan(&updatedAt))
	require.True(t, updatedAt.Equal(car.UpdatedAt), "updatedAt moved on an empty patch")
}

// The constraints are the same ones Save trips, and carWriteError is shared —
// this is what keeps a rejected update out of the 500 bucket.
func TestUpdateMapsConstraintViolationsToDomainErrors(t *testing.T) {
	pool := withDB(t)
	alice, _ := twoUsers(t, pool)
	repo := NewCarRepository(pool)

	car := aSavedCar(t, repo, alice)

	cases := []struct {
		name   string
		update domain.UpdateCar
		want   error
	}{
		{
			name:   "a usage type outside the enum",
			update: domain.UpdateCar{Id: car.Id, UserId: alice, UsageType: ptr("drift")},
			want:   domain.ErrInvalidUsageType,
		},
		{
			name:   "a year before the range",
			update: domain.UpdateCar{Id: car.Id, UserId: alice, Year: ptr(1700)},
			want:   domain.ErrInvalidYear,
		},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			_, err := repo.Update(t.Context(), tc.update)
			require.ErrorIs(t, err, tc.want)
		})
	}
}

// carsFor creates n cars for one owner. They are inserted in one statement so
// several share a createdAt to the microsecond — which is the case a cursor on
// createdAt alone gets wrong, and the reason the cursor carries the id too.
func carsFor(t *testing.T, pool *pgxpool.Pool, owner uuid.UUID, n int) {
	t.Helper()

	// One statement, so NOW() is evaluated once and every row shares a
	// createdAt to the microsecond. That is the case a cursor carrying only
	// createdAt gets wrong, and it must be the case these tests exercise.
	_, err := pool.Exec(context.Background(),
		`INSERT INTO cars (userId, make, model, year, engine, usageType)
		 SELECT $1, 'Make' || g, 'Model', 2018, 'Engine', 'weekend'
		 FROM generate_series(1, $2) AS g`,
		owner, n)
	require.NoError(t, err)
}

// walk pages to the end and returns every id seen, plus the number of requests.
func walk(t *testing.T, repo *carRepo, owner uuid.UUID, limit int) ([]uuid.UUID, int) {
	t.Helper()

	var seen []uuid.UUID
	var cursor *domain.CarCursor
	pages := 0

	for {
		query, err := domain.NewCarQuery(owner, &limit, cursor)
		require.NoError(t, err)

		page, err := repo.List(t.Context(), query)
		require.NoError(t, err)
		pages++

		for _, car := range page.Cars {
			seen = append(seen, car.Id)
		}

		if !page.HasMore {
			require.Nil(t, page.NextCursor, "a last page must not offer a cursor")
			break
		}
		require.NotNil(t, page.NextCursor, "a page with more must offer a cursor")
		cursor = page.NextCursor

		require.Less(t, pages, 50, "paging did not terminate")
	}

	return seen, pages
}

// The property that matters: a full walk yields every car exactly once. Cars
// sharing a createdAt are the case that breaks a naive cursor.
func TestListPagesThroughEveryCarExactlyOnce(t *testing.T) {
	pool := withDB(t)
	alice, _ := twoUsers(t, pool)
	repo := NewCarRepository(pool)

	carsFor(t, pool, alice, 7)

	for _, limit := range []int{1, 2, 3, 6, 7, 8, 50} {
		seen, pages := walk(t, repo, alice, limit)

		require.Len(t, seen, 7, "limit %d returned %d cars over %d pages", limit, len(seen), pages)

		unique := map[uuid.UUID]bool{}
		for _, id := range seen {
			require.False(t, unique[id], "limit %d returned a car twice", limit)
			unique[id] = true
		}
		require.Len(t, unique, 7)
	}
}

func TestListOrdersNewestFirstAndBreaksTiesStably(t *testing.T) {
	pool := withDB(t)
	alice, _ := twoUsers(t, pool)
	repo := NewCarRepository(pool)

	carsFor(t, pool, alice, 6)

	query, err := domain.NewCarQuery(alice, nil, nil)
	require.NoError(t, err)
	page, err := repo.List(t.Context(), query)
	require.NoError(t, err)
	require.Len(t, page.Cars, 6)

	for i := 1; i < len(page.Cars); i++ {
		previous, current := page.Cars[i-1], page.Cars[i]
		if previous.CreatedAt.Equal(current.CreatedAt) {
			// The tiebreak, which is what makes the order total.
			require.Greater(t, previous.Id.String(), current.Id.String(), "ties must fall back to id descending")
			continue
		}
		require.True(t, previous.CreatedAt.After(current.CreatedAt), "cars must be newest first")
	}
}

// The list IDOR test: the owner comes from the query, and no cursor can reach
// past it — not one minted from another user's page, and not a forged one.
func TestListNeverReturnsAnotherUsersCars(t *testing.T) {
	pool := withDB(t)
	alice, bob := twoUsers(t, pool)
	repo := NewCarRepository(pool)

	carsFor(t, pool, alice, 3)
	carsFor(t, pool, bob, 4)

	bobsPage, err := repo.List(t.Context(), mustQuery(t, bob, nil))
	require.NoError(t, err)
	require.Len(t, bobsPage.Cars, 4)

	bobsIds := map[uuid.UUID]bool{}
	for _, car := range bobsPage.Cars {
		bobsIds[car.Id] = true
	}

	// A cursor built from one of Bob's rows, replayed by Alice.
	forged := &domain.CarCursor{CreatedAt: bobsPage.Cars[0].CreatedAt.Add(time.Hour), Id: bobsPage.Cars[0].Id}

	for _, cursor := range []*domain.CarCursor{nil, forged} {
		page, err := repo.List(t.Context(), mustQuery(t, alice, cursor))
		require.NoError(t, err)

		for _, car := range page.Cars {
			require.Equal(t, alice, car.UserId, "a car of another user was returned")
			require.False(t, bobsIds[car.Id], "one of Bob's cars leaked into Alice's list")
		}
		// The count is Alice's own, never the table's.
		require.Equal(t, 3, page.Total)
	}
}

func TestListOfAnEmptyGarageIsAnEmptyPage(t *testing.T) {
	pool := withDB(t)
	alice, bob := twoUsers(t, pool)
	repo := NewCarRepository(pool)

	// Bob has cars; Alice does not. Alice's page must not borrow them.
	carsFor(t, pool, bob, 3)

	page, err := repo.List(t.Context(), mustQuery(t, alice, nil))

	require.NoError(t, err)
	require.Empty(t, page.Cars)
	require.False(t, page.HasMore)
	require.Nil(t, page.NextCursor)
	require.Zero(t, page.Total)
}

// hasMore must describe the next page, not the current one — the off-by-one
// that reports "more" on an exactly-full last page sends a client to fetch it.
func TestListReportsHasMoreOnlyWhenAPageFollows(t *testing.T) {
	pool := withDB(t)
	alice, _ := twoUsers(t, pool)
	repo := NewCarRepository(pool)

	carsFor(t, pool, alice, 4)

	cases := []struct {
		limit       int
		wantCars    int
		wantHasMore bool
	}{
		{limit: 3, wantCars: 3, wantHasMore: true},
		{limit: 4, wantCars: 4, wantHasMore: false}, // exactly full, nothing after
		{limit: 5, wantCars: 4, wantHasMore: false},
	}

	for _, tc := range cases {
		page, err := repo.List(t.Context(), mustQuery(t, alice, nil, tc.limit))
		require.NoError(t, err)

		require.Len(t, page.Cars, tc.wantCars, "limit %d", tc.limit)
		require.Equal(t, tc.wantHasMore, page.HasMore, "limit %d", tc.limit)
		require.Equal(t, tc.wantHasMore, page.NextCursor != nil, "limit %d", tc.limit)
		require.Equal(t, 4, page.Total)
	}
}

func mustQuery(t *testing.T, owner uuid.UUID, cursor *domain.CarCursor, limit ...int) domain.CarQuery {
	t.Helper()

	var size *int
	if len(limit) > 0 {
		size = &limit[0]
	}

	query, err := domain.NewCarQuery(owner, size, cursor)
	require.NoError(t, err)

	return query
}
