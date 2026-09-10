package rest_test

import (
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/stretchr/testify/require"

	"github.com/willikay11/wrench/api/internal/core/domain"
	"github.com/willikay11/wrench/api/internal/rest"
)

/*
GET /v1/cars reads two query parameters, refuses what it cannot parse, and
renders a page. Which rows a page contains is a property of the SQL and is
covered in internal/postgres against a real database; here the subject is the
HTTP contract — the parameters, the problem bodies, and the JSON shape a client
is promised.
*/

func list(t *testing.T, handler *rest.CarHandler, userID uuid.UUID, query string) *httptest.ResponseRecorder {
	t.Helper()

	target := "/v1/cars"
	if query != "" {
		target += "?" + query
	}

	request := httptest.NewRequest(http.MethodGet, target, nil)
	request = request.WithContext(domain.WithUserID(request.Context(), userID))

	recorder := httptest.NewRecorder()
	handler.ListCars(recorder, request)

	return recorder
}

func aCarNamed(make string, createdAt time.Time) domain.Car {
	return domain.Car{
		Id: uuid.New(), UserId: uuid.New(), Make: make, Model: "Evolution 10",
		Year: 2018, Engine: "4B11T", UsageType: "weekend",
		Notes: "secret notes", CreatedAt: createdAt, UpdatedAt: createdAt,
	}
}

func TestListCarsRendersThePageContract(t *testing.T) {
	created := time.Date(2026, 9, 10, 8, 0, 0, 0, time.UTC)
	car := aCarNamed("Mitsubishi", created)
	next := domain.CarCursor{CreatedAt: created, Id: car.Id}

	service := &fakeCarService{page: domain.CarPage{
		Cars: []domain.Car{car}, NextCursor: &next, HasMore: true, Total: 7,
	}}

	recorder := list(t, rest.NewCarHandler(service), uuid.New(), "")

	require.Equal(t, http.StatusOK, recorder.Code)
	require.Equal(t, "application/json", recorder.Header().Get("Content-Type"))

	var response rest.CarListResponse
	require.NoError(t, json.Unmarshal(recorder.Body.Bytes(), &response))

	require.Len(t, response.Data, 1)
	require.Equal(t, car.Id.String(), response.Data[0].Id)
	require.Equal(t, "Mitsubishi", response.Data[0].Make)
	require.Equal(t, 2018, response.Data[0].Year)

	require.True(t, response.Pagination.HasMore)
	require.Equal(t, 7, response.Pagination.Total)
	require.NotNil(t, response.Pagination.NextCursor)

	// The cursor a client gets back must be one the API can read again.
	decoded, err := domain.DecodeCarCursor(*response.Pagination.NextCursor)
	require.NoError(t, err)
	require.Equal(t, car.Id, decoded.Id)
}

// The list view is deliberately narrower than the car. notes can run to a
// thousand characters and no garage list needs them.
func TestListCarsDoesNotShipTheFullCar(t *testing.T) {
	service := &fakeCarService{page: domain.CarPage{
		Cars: []domain.Car{aCarNamed("Mitsubishi", time.Now())}, Total: 1,
	}}

	recorder := list(t, rest.NewCarHandler(service), uuid.New(), "")

	require.NotContains(t, recorder.Body.String(), "secret notes")
	require.NotContains(t, recorder.Body.String(), "notes")
	// userId is not in the list view either: every car in it belongs to the
	// caller by construction, so repeating it per row says nothing.
	require.NotContains(t, recorder.Body.String(), "userId")
}

// An empty garage is a page with no cars, not an error and not a null list —
// a client iterating data should not have to special-case it.
func TestListCarsRendersAnEmptyGarageAsAnEmptyArray(t *testing.T) {
	service := &fakeCarService{page: domain.CarPage{}}

	recorder := list(t, rest.NewCarHandler(service), uuid.New(), "")

	require.Equal(t, http.StatusOK, recorder.Code)

	var raw map[string]any
	require.NoError(t, json.Unmarshal(recorder.Body.Bytes(), &raw))
	require.Equal(t, []any{}, raw["data"], "data must be [] and never null")

	pagination := raw["pagination"].(map[string]any)
	require.Equal(t, false, pagination["hasMore"])
	require.Nil(t, pagination["nextCursor"])
	require.Equal(t, float64(0), pagination["total"])

	// nextCursor must be present-and-null, not absent, so a client reading it
	// finds an explicit "there is no next page".
	require.Contains(t, pagination, "nextCursor")
}

func TestListCarsAppliesTheLimitRules(t *testing.T) {
	cases := []struct {
		name      string
		query     string
		wantLimit int
	}{
		{name: "absent takes the default", query: "", wantLimit: domain.DefaultCarPageSize},
		{name: "the lower boundary", query: "limit=1", wantLimit: 1},
		{name: "the upper boundary", query: "limit=50", wantLimit: 50},
		{name: "a value in between", query: "limit=20", wantLimit: 20},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			service := &fakeCarService{}

			recorder := list(t, rest.NewCarHandler(service), uuid.New(), tc.query)

			require.Equal(t, http.StatusOK, recorder.Code)
			require.Equal(t, tc.wantLimit, service.receivedQuery.Limit)
		})
	}
}

// Refused rather than clamped: a request for 500 that quietly returns 50 tells
// the client its page size was honoured when it was not.
func TestListCarsRefusesALimitOutsideTheRange(t *testing.T) {
	for _, query := range []string{"limit=0", "limit=-1", "limit=51", "limit=1000", "limit=abc", "limit=1.5", "limit="} {
		service := &fakeCarService{}

		recorder := list(t, rest.NewCarHandler(service), uuid.New(), query)

		require.Equal(t, http.StatusUnprocessableEntity, recorder.Code, "query %q", query)
		problem := decodeListProblem(t, recorder)
		require.Equal(t, "/problems/validation-failed", problem.Type)
		require.Equal(t, []rest.InvalidParam{{Name: "limit", Reason: "This field must be a whole number between 1 and 50"}}, problem.InvalidParams)
		require.Zero(t, service.calls)
	}
}

func TestListCarsPassesAValidCursorThrough(t *testing.T) {
	cursor := domain.CarCursor{CreatedAt: time.Now().UTC(), Id: uuid.New()}
	service := &fakeCarService{}

	recorder := list(t, rest.NewCarHandler(service), uuid.New(), "cursor="+cursor.Encode())

	require.Equal(t, http.StatusOK, recorder.Code)
	require.NotNil(t, service.receivedQuery.Cursor)
	require.Equal(t, cursor.Id, service.receivedQuery.Cursor.Id)
}

// A cursor that cannot be read is refused. Falling back to the first page would
// hand a paging client the same page forever without it ever finishing.
func TestListCarsRefusesACursorItCannotRead(t *testing.T) {
	for _, cursor := range []string{"nonsense", "!!!", "eyJmb28iOiJiYXIifQ", strings.Repeat("a", 200), ""} {
		service := &fakeCarService{}

		recorder := list(t, rest.NewCarHandler(service), uuid.New(), "cursor="+cursor)

		require.Equal(t, http.StatusUnprocessableEntity, recorder.Code, "cursor %q", cursor)
		require.Equal(t, "cursor", decodeListProblem(t, recorder).InvalidParams[0].Name)
		require.Zero(t, service.calls, "an unreadable cursor must not reach the service")
	}
}

// The owner is the token's. There is no userId parameter, and inventing one
// must not change whose garage is listed.
func TestListCarsTakesTheOwnerFromTheTokenOnly(t *testing.T) {
	userID, other := uuid.New(), uuid.New()
	service := &fakeCarService{}

	recorder := list(t, rest.NewCarHandler(service), userID,
		"userId="+other.String()+"&user_id="+other.String()+"&owner="+other.String())

	require.Equal(t, http.StatusOK, recorder.Code)
	require.Equal(t, userID, service.receivedQuery.UserId)
	require.NotEqual(t, other, service.receivedQuery.UserId)
}

func TestListCarsHidesServiceFailures(t *testing.T) {
	service := &fakeCarService{err: errors.New("dial tcp: connection refused")}

	recorder := list(t, rest.NewCarHandler(service), uuid.New(), "")

	require.Equal(t, http.StatusInternalServerError, recorder.Code)
	require.Equal(t, "about:blank", decodeListProblem(t, recorder).Type)
	require.NotContains(t, recorder.Body.String(), "connection refused")
}

func TestListCarsPanicsWithoutTheAuthMiddleware(t *testing.T) {
	request := httptest.NewRequest(http.MethodGet, "/v1/cars", nil)
	recorder := httptest.NewRecorder()

	require.Panics(t, func() {
		rest.NewCarHandler(&fakeCarService{}).ListCars(recorder, request)
	})
}

func decodeListProblem(t *testing.T, recorder *httptest.ResponseRecorder) rest.Problem {
	t.Helper()

	require.Equal(t, "application/problem+json", recorder.Header().Get("Content-Type"))

	var problem rest.Problem
	require.NoError(t, json.Unmarshal(recorder.Body.Bytes(), &problem))
	require.Equal(t, recorder.Code, problem.Status)
	require.Equal(t, "/v1/cars", problem.Instance)

	return problem
}
