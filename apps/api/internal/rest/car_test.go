package rest_test

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/google/uuid"
	"github.com/stretchr/testify/require"

	"github.com/willikay11/wrench/api/internal/core/domain"
	"github.com/willikay11/wrench/api/internal/rest"
)

/*
POST /v1/cars is the handler's whole job: decode a body, validate it, stamp the
authenticated user onto it, and hand it to the service. These tests drive the
real handler over httptest with only the service faked, so what is under test is
the HTTP contract — status codes, the RFC 7807 problem bodies, and which of the
caller's bytes are allowed to reach the service. The service's own behaviour is
already covered by internal/core/services/car; nothing here re-tests it.
*/

// fakeCarService records what the handler passed down, so a test can assert on
// the car the service would have persisted rather than only on the response.
type fakeCarService struct {
	calls    int
	received domain.Car

	result domain.Car
	err    error
}

func (f *fakeCarService) CreateCar(_ context.Context, car domain.Car) (domain.Car, error) {
	f.calls++
	f.received = car

	if f.err != nil {
		return domain.Car{}, f.err
	}
	return f.result, nil
}

// validCar is the body a well-behaved client sends: every validate tag on
// domain.Car satisfied. Tests that probe one rule start from this and break
// exactly that field, so a failure names the rule it was aimed at.
func validCar() map[string]any {
	return map[string]any{
		"make":      "Mitsubishi",
		"model":     "Evolution 10",
		"year":      2018,
		"engine":    "4B11T",
		"usageType": "weekend",
		"notes":     "Stage 2, needs a gearbox rebuild",
	}
}

// post drives the handler exactly as the router does, with the user id already
// on the context — that is the middleware's contract, and CreateCar relies on
// it. body is sent verbatim so a test can send bytes that are not valid JSON.
func post(t *testing.T, handler *rest.CarHandler, userID uuid.UUID, body string) *httptest.ResponseRecorder {
	t.Helper()

	request := httptest.NewRequest(http.MethodPost, "/v1/cars", strings.NewReader(body))
	request.Header.Set("Content-Type", "application/json")
	request = request.WithContext(domain.WithUserID(request.Context(), userID))

	recorder := httptest.NewRecorder()
	handler.CreateCar(recorder, request)

	return recorder
}

// postJSON is post for the common case of a body that starts as a Go value.
func postJSON(t *testing.T, handler *rest.CarHandler, userID uuid.UUID, body any) *httptest.ResponseRecorder {
	t.Helper()

	encoded, err := json.Marshal(body)
	require.NoError(t, err)

	return post(t, handler, userID, string(encoded))
}

// decodeProblem reads a response as problem details and asserts the parts RFC
// 7807 requires of every one of them: the media type, and a status member that
// agrees with the status line.
func decodeProblem(t *testing.T, recorder *httptest.ResponseRecorder) rest.Problem {
	t.Helper()

	require.Equal(t, "application/problem+json", recorder.Header().Get("Content-Type"))

	var problem rest.Problem
	require.NoError(t, json.Unmarshal(recorder.Body.Bytes(), &problem))
	require.Equal(t, recorder.Code, problem.Status)
	// Instance points at the occurrence, which for this API is the request path.
	require.Equal(t, "/v1/cars", problem.Instance)

	return problem
}

func TestCreateCarPersistsAndReturnsTheCreatedCar(t *testing.T) {
	userID := uuid.New()
	created := domain.Car{
		Id: uuid.New(), UserId: userID,
		Make: "Mitsubishi", Model: "Evolution 10", Year: 2018,
		Engine: "4B11T", UsageType: "weekend", Notes: "Stage 2, needs a gearbox rebuild",
	}
	service := &fakeCarService{result: created}

	recorder := postJSON(t, rest.NewCarHandler(service), userID, validCar())

	require.Equal(t, http.StatusCreated, recorder.Code)
	require.Equal(t, "application/json", recorder.Header().Get("Content-Type"))

	// The response is the service's car, not the request echoed back.
	var got domain.Car
	require.NoError(t, json.Unmarshal(recorder.Body.Bytes(), &got))
	require.Equal(t, created, got)

	// And the service saw the body's fields intact.
	require.Equal(t, 1, service.calls)
	require.Equal(t, "Mitsubishi", service.received.Make)
	require.Equal(t, "Evolution 10", service.received.Model)
	require.Equal(t, 2018, service.received.Year)
	require.Equal(t, "4B11T", service.received.Engine)
	require.Equal(t, "weekend", service.received.UsageType)
	require.Equal(t, "Stage 2, needs a gearbox rebuild", service.received.Notes)
}

// domain.Car carries UserId with a json tag, so the field is decodable from the
// body. The handler overwrites it from the context afterwards; this pins that
// ordering, without which a caller could file a car under someone else's id.
func TestCreateCarIgnoresACallerSuppliedOwner(t *testing.T) {
	userID, victimID := uuid.New(), uuid.New()
	service := &fakeCarService{}

	body := validCar()
	body["userId"] = victimID.String()
	body["id"] = uuid.New().String()

	recorder := postJSON(t, rest.NewCarHandler(service), userID, body)

	require.Equal(t, http.StatusCreated, recorder.Code)
	require.Equal(t, userID, service.received.UserId)
	require.NotEqual(t, victimID, service.received.UserId)
}

// The handler is mounted behind the JWT middleware and reads the user with
// MustUserID. Unmounted, that panics rather than saving a car owned by nobody —
// this test is what keeps that failure loud if the route is ever moved.
func TestCreateCarPanicsWithoutTheAuthMiddleware(t *testing.T) {
	service := &fakeCarService{}

	encoded, err := json.Marshal(validCar())
	require.NoError(t, err)

	request := httptest.NewRequest(http.MethodPost, "/v1/cars", strings.NewReader(string(encoded)))
	recorder := httptest.NewRecorder()

	require.Panics(t, func() { rest.NewCarHandler(service).CreateCar(recorder, request) })
	require.Zero(t, service.calls)
}

func TestCreateCarRejectsABodyItCannotRead(t *testing.T) {
	cases := []struct {
		name string
		body string
	}{
		{name: "empty", body: ""},
		{name: "truncated JSON", body: `{"make":"Mitsubishi"`},
		{name: "not JSON at all", body: "make=Mitsubishi"},
		// A JSON array is well formed but is not the object the endpoint takes,
		// so decoding into the struct still fails.
		{name: "a JSON array", body: `[{"make":"Mitsubishi"}]`},
		// Right field, wrong type: year is an int, and no coercion should happen.
		{name: "a field of the wrong type", body: `{"year":"2018"}`},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			service := &fakeCarService{}

			recorder := post(t, rest.NewCarHandler(service), uuid.New(), tc.body)

			require.Equal(t, http.StatusBadRequest, recorder.Code)
			problem := decodeProblem(t, recorder)
			require.Equal(t, "/problems/malformed-body", problem.Type)
			require.Empty(t, problem.InvalidParams)
			// Nothing unreadable reaches the service.
			require.Zero(t, service.calls)
		})
	}
}

// The body is capped at 1MB by MaxBytesReader, which surfaces as a decode
// failure — the same 400 as any other unreadable body.
func TestCreateCarRejectsAnOversizedBody(t *testing.T) {
	service := &fakeCarService{}

	body := validCar()
	body["notes"] = strings.Repeat("a", 1<<20)

	recorder := postJSON(t, rest.NewCarHandler(service), uuid.New(), body)

	require.Equal(t, http.StatusBadRequest, recorder.Code)
	require.Equal(t, "/problems/malformed-body", decodeProblem(t, recorder).Type)
	require.Zero(t, service.calls)
}

// One case per rule domain.Car declares, asserting the field is reported by the
// name the client sent — the RegisterTagNameFunc in car.go — and that the
// reason describes the rule in the client's terms.
func TestCreateCarReportsEachInvalidFieldByItsJSONName(t *testing.T) {
	cases := []struct {
		name   string
		mutate func(body map[string]any)
		field  string
		reason string
	}{
		{
			name:   "missing make",
			mutate: func(b map[string]any) { delete(b, "make") },
			field:  "make",
			reason: "This field is required",
		},
		{
			name:   "make below the minimum length",
			mutate: func(b map[string]any) { b["make"] = "BM" },
			field:  "make",
			reason: "This field must be at least 3 characters",
		},
		{
			name:   "model above the maximum length",
			mutate: func(b map[string]any) { b["model"] = strings.Repeat("x", 51) },
			field:  "model",
			reason: "This field must be at most 50 characters",
		},
		{
			// A zero year is indistinguishable from an absent one on an int, so
			// required fires before the range rules do.
			name:   "missing year",
			mutate: func(b map[string]any) { delete(b, "year") },
			field:  "year",
			reason: "This field is required",
		},
		{
			// Numbers compare by value, so the bound carries no unit.
			name:   "year before the first car",
			mutate: func(b map[string]any) { b["year"] = 1884 },
			field:  "year",
			reason: "This field must be 1885 or more",
		},
		{
			name:   "year beyond the accepted range",
			mutate: func(b map[string]any) { b["year"] = 2031 },
			field:  "year",
			reason: "This field must be 2030 or less",
		},
		{
			name:   "missing engine",
			mutate: func(b map[string]any) { delete(b, "engine") },
			field:  "engine",
			reason: "This field is required",
		},
		{
			name:   "an unknown usage type",
			mutate: func(b map[string]any) { b["usageType"] = "drift" },
			field:  "usageType",
			reason: "This field must be one of: daily, track, show, weekend, off-road, project",
		},
		{
			// omitempty means notes may be absent, but not present-and-too-short.
			name:   "notes present but too short",
			mutate: func(b map[string]any) { b["notes"] = "ok" },
			field:  "notes",
			reason: "This field must be at least 3 characters",
		},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			service := &fakeCarService{}

			body := validCar()
			tc.mutate(body)

			recorder := postJSON(t, rest.NewCarHandler(service), uuid.New(), body)

			require.Equal(t, http.StatusUnprocessableEntity, recorder.Code)
			problem := decodeProblem(t, recorder)
			require.Equal(t, "/problems/validation-failed", problem.Type)
			require.Equal(t,
				[]rest.InvalidParam{{Name: tc.field, Reason: tc.reason}},
				problem.InvalidParams,
			)
			// An invalid car is never offered to the service.
			require.Zero(t, service.calls)
		})
	}
}

// Validation reports every broken field at once, so a client can fix a form in
// one pass rather than one field per round trip.
func TestCreateCarReportsAllInvalidFieldsTogether(t *testing.T) {
	service := &fakeCarService{}

	recorder := postJSON(t, rest.NewCarHandler(service), uuid.New(), map[string]any{
		"make":      "BM",
		"year":      1700,
		"usageType": "drift",
	})

	require.Equal(t, http.StatusUnprocessableEntity, recorder.Code)
	problem := decodeProblem(t, recorder)

	named := make(map[string]string, len(problem.InvalidParams))
	for _, param := range problem.InvalidParams {
		named[param.Name] = param.Reason
	}

	require.Equal(t, map[string]string{
		"make":      "This field must be at least 3 characters",
		"model":     "This field is required",
		"year":      "This field must be 1885 or more",
		"engine":    "This field is required",
		"usageType": "This field must be one of: daily, track, show, weekend, off-road, project",
	}, named)
	require.Zero(t, service.calls)
}

// Omitted optional fields are not validation failures: notes is the only one.
func TestCreateCarAcceptsACarWithoutNotes(t *testing.T) {
	service := &fakeCarService{}

	body := validCar()
	delete(body, "notes")

	recorder := postJSON(t, rest.NewCarHandler(service), uuid.New(), body)

	require.Equal(t, http.StatusCreated, recorder.Code)
	require.Equal(t, 1, service.calls)
	require.Empty(t, service.received.Notes)
}

// A service failure is not the caller's to act on, so the body says nothing
// about it — the cause goes to the log instead.
func TestCreateCarHidesServiceFailuresBehindAGenericProblem(t *testing.T) {
	service := &fakeCarService{err: errors.New("pq: duplicate key value violates unique constraint \"cars_pkey\"")}

	recorder := postJSON(t, rest.NewCarHandler(service), uuid.New(), validCar())

	require.Equal(t, http.StatusInternalServerError, recorder.Code)
	problem := decodeProblem(t, recorder)
	require.Equal(t, "about:blank", problem.Type)
	require.Equal(t, "Internal Server Error", problem.Title)
	require.Equal(t, "Something went wrong. Please try again.", problem.Detail)

	// No internals in the body: not the driver's message, not the table name.
	require.NotContains(t, recorder.Body.String(), "cars_pkey")
	require.NotContains(t, recorder.Body.String(), "duplicate key")
}

// The database enforces the same rules the validate tags do. When one of its
// constraints is what catches a car, the caller gets the validation failure it
// is — the same 422 shape, naming the same field — not a 500 that reads as an
// outage. These are only reachable when the two layers disagree, which is
// exactly when a clear answer matters most.
func TestCreateCarReportsDatabaseRuleFailuresAsValidationProblems(t *testing.T) {
	cases := []struct {
		name   string
		err    error
		params []rest.InvalidParam
		detail string
	}{
		{
			name:   "the usage type constraint",
			err:    domain.ErrInvalidUsageType,
			params: []rest.InvalidParam{{Name: "usageType", Reason: "This field must be one of: daily, track, show, weekend, off-road, project"}},
		},
		{
			name:   "the year constraint",
			err:    domain.ErrInvalidYear,
			params: []rest.InvalidParam{{Name: "year", Reason: "This field must be between 1885 and 2030"}},
		},
		{
			// NOT NULL and the varchar width name no field by the time they
			// reach the handler, so these report the rule without one.
			name:   "a missing required field",
			err:    domain.ErrMissingField,
			detail: "A required field was empty.",
		},
		{
			name:   "a field wider than its column",
			err:    domain.ErrFieldTooLong,
			detail: "A field was longer than the maximum allowed.",
		},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			service := &fakeCarService{err: tc.err}

			recorder := postJSON(t, rest.NewCarHandler(service), uuid.New(), validCar())

			require.Equal(t, http.StatusUnprocessableEntity, recorder.Code)
			problem := decodeProblem(t, recorder)
			require.Equal(t, "/problems/validation-failed", problem.Type)
			require.Equal(t, tc.params, problem.InvalidParams)
			require.Equal(t, tc.detail, problem.Detail)
		})
	}
}

// The owner is taken from the token, never from the body, so the database not
// having it means the account is gone. That is an authentication problem — a
// 422 would invite the client to retry with a different car, which cannot help.
func TestCreateCarAnswersADeletedAccountAsUnauthenticated(t *testing.T) {
	service := &fakeCarService{err: domain.ErrUnknownOwner}

	recorder := postJSON(t, rest.NewCarHandler(service), uuid.New(), validCar())

	require.Equal(t, http.StatusUnauthorized, recorder.Code)
	problem := decodeProblem(t, recorder)
	require.Equal(t, "about:blank", problem.Type)
	require.Equal(t, "This account no longer exists. Please sign in again.", problem.Detail)
	require.Empty(t, problem.InvalidParams)
}

// The mapping must not widen: an error the handler does not recognise stays a
// 500, including one that merely mentions a constraint in its text.
func TestCreateCarStillHidesUnrecognisedFailures(t *testing.T) {
	cases := []struct {
		name string
		err  error
	}{
		{name: "a bare failure", err: errors.New("dial tcp: connection refused")},
		{name: "text that names a mapped constraint", err: errors.New(`violates check constraint "cars_usagetype_check"`)},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			service := &fakeCarService{err: tc.err}

			recorder := postJSON(t, rest.NewCarHandler(service), uuid.New(), validCar())

			require.Equal(t, http.StatusInternalServerError, recorder.Code)
			require.Equal(t, "about:blank", decodeProblem(t, recorder).Type)
			require.NotContains(t, recorder.Body.String(), "cars_usagetype_check")
		})
	}
}

// A wrapped domain error is what a repository actually returns once it adds
// context, so errors.Is is the right test and a type switch would not be.
func TestCreateCarSeesThroughWrappedDomainErrors(t *testing.T) {
	service := &fakeCarService{err: fmt.Errorf("create car entry: %w", domain.ErrInvalidYear)}

	recorder := postJSON(t, rest.NewCarHandler(service), uuid.New(), validCar())

	require.Equal(t, http.StatusUnprocessableEntity, recorder.Code)
	require.Equal(t,
		[]rest.InvalidParam{{Name: "year", Reason: "This field must be between 1885 and 2030"}},
		decodeProblem(t, recorder).InvalidParams,
	)
}
