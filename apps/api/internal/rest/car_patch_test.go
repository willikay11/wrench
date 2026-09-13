package rest_test

import (
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/stretchr/testify/require"

	"github.com/willikay11/wrench/api/internal/core/domain"
	"github.com/willikay11/wrench/api/internal/rest"
)

/*
PATCH /v1/cars/{carId} decodes a partial body, refuses one that asks for
nothing, takes the id from the path and the owner from the token, and hands
both to the service. Which rows an UPDATE reaches is a property of the SQL and
is covered in internal/postgres against a real database; what is under test
here is the HTTP contract — the statuses, the problem bodies, and which of the
caller's bytes are allowed to influence the update.
*/

// patch drives the handler through a chi router, so {id} is populated exactly
// as it is in production — a handler called directly would see an empty param.
func patch(t *testing.T, handler *rest.CarHandler, userID uuid.UUID, carID, body string) *httptest.ResponseRecorder {
	t.Helper()

	router := chi.NewRouter()
	router.Patch("/v1/cars/{id}", handler.UpdateCar)

	request := httptest.NewRequest(http.MethodPatch, "/v1/cars/"+carID, strings.NewReader(body))
	request.Header.Set("Content-Type", "application/json")
	request = request.WithContext(domain.WithUserID(request.Context(), userID))

	recorder := httptest.NewRecorder()
	router.ServeHTTP(recorder, request)

	return recorder
}

func patchJSON(t *testing.T, handler *rest.CarHandler, userID uuid.UUID, carID string, body any) *httptest.ResponseRecorder {
	t.Helper()

	encoded, err := json.Marshal(body)
	require.NoError(t, err)

	return patch(t, handler, userID, carID, string(encoded))
}

func TestUpdateCarPassesThePathIdAndTokenOwnerToTheService(t *testing.T) {
	userID, carID := uuid.New(), uuid.New()
	updated := domain.Car{Id: carID, UserId: userID, Make: "Subaru", Model: "Impreza"}
	service := &fakeCarService{result: updated}

	recorder := patchJSON(t, rest.NewCarHandler(service), userID, carID.String(), map[string]any{"make": "Subaru"})

	require.Equal(t, http.StatusOK, recorder.Code)
	require.Equal(t, "application/json", recorder.Header().Get("Content-Type"))

	var got domain.Car
	require.NoError(t, json.Unmarshal(recorder.Body.Bytes(), &got))
	require.Equal(t, updated, got)

	// The id comes from the path and the owner from the token.
	require.Equal(t, carID, service.receivedUpdatedCar.Id)
	require.Equal(t, userID, service.receivedUpdatedCar.UserId)
	// Only the field the body named is carried down.
	require.Equal(t, "Subaru", *service.receivedUpdatedCar.Make)
	require.Nil(t, service.receivedUpdatedCar.Model)
	require.Nil(t, service.receivedUpdatedCar.Year)
	require.False(t, service.receivedUpdatedCar.Notes.Sent)
}

// The path id and the token owner win over anything the body claims, so a
// caller cannot repoint an update at another car or another user.
func TestUpdateCarIgnoresIdentifiersInTheBody(t *testing.T) {
	userID, carID := uuid.New(), uuid.New()
	otherUser, otherCar := uuid.New(), uuid.New()
	service := &fakeCarService{}

	recorder := patchJSON(t, rest.NewCarHandler(service), userID, carID.String(), map[string]any{
		"make":   "Subaru",
		"id":     otherCar.String(),
		"userId": otherUser.String(),
	})

	require.Equal(t, http.StatusOK, recorder.Code)
	require.Equal(t, carID, service.receivedUpdatedCar.Id)
	require.Equal(t, userID, service.receivedUpdatedCar.UserId)
	require.NotEqual(t, otherCar, service.receivedUpdatedCar.Id)
	require.NotEqual(t, otherUser, service.receivedUpdatedCar.UserId)
}

// The tri-state, at the HTTP boundary: three bodies, three different
// instructions for one field.
func TestUpdateCarCarriesTheThreeStatesOfNotes(t *testing.T) {
	cases := []struct {
		name      string
		body      string
		wantSent  bool
		wantValue *string
	}{
		{name: "omitted leaves notes alone", body: `{"make":"Subaru"}`, wantSent: false},
		{name: "null clears notes", body: `{"notes":null}`, wantSent: true, wantValue: nil},
		{name: "a value sets notes", body: `{"notes":"rebuilt gearbox"}`, wantSent: true, wantValue: ptrTo("rebuilt gearbox")},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			service := &fakeCarService{}

			recorder := patch(t, rest.NewCarHandler(service), uuid.New(), uuid.New().String(), tc.body)

			require.Equal(t, http.StatusOK, recorder.Code)
			require.Equal(t, tc.wantSent, service.receivedUpdatedCar.Notes.Sent)
			if tc.wantValue == nil {
				require.Nil(t, service.receivedUpdatedCar.Notes.Value)
			} else {
				require.Equal(t, *tc.wantValue, *service.receivedUpdatedCar.Notes.Value)
			}
		})
	}
}

// A body that names nothing is refused without reaching the service, since
// there is no update to attempt and a 200 would report a change never made.
func TestUpdateCarRefusesABodyThatAsksForNothing(t *testing.T) {
	for _, body := range []string{`{}`, `null`} {
		service := &fakeCarService{}

		recorder := patch(t, rest.NewCarHandler(service), uuid.New(), uuid.New().String(), body)

		require.Equal(t, http.StatusUnprocessableEntity, recorder.Code, "body %s", body)
		problem := decodePatchProblem(t, recorder)
		require.Equal(t, "/problems/validation-failed", problem.Type)
		require.Equal(t, "Provide at least one field to update.", problem.Detail)
		require.Zero(t, service.calls)
	}
}

// Not found and not yours are the same answer: a 403, or a different body,
// would confirm to a caller that another user's car id is real.
func TestUpdateCarAnswersAnUnreachableCarAsNotFound(t *testing.T) {
	service := &fakeCarService{err: domain.ErrCarNotFound}

	recorder := patchJSON(t, rest.NewCarHandler(service), uuid.New(), uuid.New().String(), map[string]any{"make": "Subaru"})

	require.Equal(t, http.StatusNotFound, recorder.Code)
	problem := decodePatchProblem(t, recorder)
	require.Equal(t, "No car with that id.", problem.Detail)
	require.Empty(t, problem.InvalidParams)
}

// A malformed id is answered like a missing one, so the shape of an id tells a
// caller nothing about whether it exists.
func TestUpdateCarAnswersAMalformedIdAsNotFound(t *testing.T) {
	for _, carID := range []string{"not-a-uuid", "123", strings.Repeat("f", 40)} {
		service := &fakeCarService{}

		recorder := patchJSON(t, rest.NewCarHandler(service), uuid.New(), carID, map[string]any{"make": "Subaru"})

		require.Equal(t, http.StatusNotFound, recorder.Code, "id %q", carID)
		require.Zero(t, service.calls)
	}
}

// The same rules as create, enforced on the fields the body actually carries.
func TestUpdateCarValidatesTheFieldsItWasGiven(t *testing.T) {
	cases := []struct {
		name   string
		body   map[string]any
		field  string
		reason string
	}{
		// A pointer field that is present but blank: omitempty alone would let it
		// through, so notblank is what stops a PATCH blanking a make.
		{name: "a make that is only whitespace", body: map[string]any{"make": "   "}, field: "make", reason: "This field cannot be blank"},
		{name: "an empty model", body: map[string]any{"model": ""}, field: "model", reason: "This field cannot be blank"},
		{name: "an engine that is only whitespace", body: map[string]any{"engine": "\t"}, field: "engine", reason: "This field cannot be blank"},
		{name: "make too long", body: map[string]any{"make": strings.Repeat("x", 51)}, field: "make", reason: "This field must be at most 50 characters"},
		{name: "engine too long", body: map[string]any{"engine": strings.Repeat("x", 101)}, field: "engine", reason: "This field must be at most 100 characters"},
		{name: "notes too long", body: map[string]any{"notes": strings.Repeat("x", 1001)}, field: "notes", reason: "This field must be at most 1000 characters"},
		{name: "year before the range", body: map[string]any{"year": 1884}, field: "year", reason: "This field must be 1885 or more"},
		{name: "year beyond the range", body: map[string]any{"year": 2031}, field: "year", reason: "This field must be 2030 or less"},
		{name: "an unknown usage type", body: map[string]any{"usageType": "drift"}, field: "usageType", reason: "This field must be one of: daily, track, show, weekend, off-road, project"},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			service := &fakeCarService{}

			recorder := patchJSON(t, rest.NewCarHandler(service), uuid.New(), uuid.New().String(), tc.body)

			require.Equal(t, http.StatusUnprocessableEntity, recorder.Code)
			problem := decodePatchProblem(t, recorder)
			require.Equal(t, []rest.InvalidParam{{Name: tc.field, Reason: tc.reason}}, problem.InvalidParams)
			require.Zero(t, service.calls)
		})
	}
}

// The boundaries the rules accept, which no rejection case would catch.
func TestUpdateCarAcceptsTheYearRangeBoundaries(t *testing.T) {
	for _, year := range []int{1885, 2030} {
		service := &fakeCarService{}

		recorder := patchJSON(t, rest.NewCarHandler(service), uuid.New(), uuid.New().String(), map[string]any{"year": year})

		require.Equal(t, http.StatusOK, recorder.Code, "year %d", year)
		require.Equal(t, year, *service.receivedUpdatedCar.Year)
	}
}

// Clearing notes is not a validation failure: null unwraps to no value, which
// omitempty skips.
func TestUpdateCarDoesNotValidateAClearedNotes(t *testing.T) {
	service := &fakeCarService{}

	recorder := patch(t, rest.NewCarHandler(service), uuid.New(), uuid.New().String(), `{"notes":null}`)

	require.Equal(t, http.StatusOK, recorder.Code)
	require.Equal(t, 1, service.calls)
}

func TestUpdateCarRejectsBodiesItCannotRead(t *testing.T) {
	cases := []struct {
		name   string
		body   string
		detail string
	}{
		{name: "truncated", body: `{"make":"Subaru"`, detail: "only the fields this endpoint defines"},
		{name: "not JSON", body: `make=Subaru`, detail: "only the fields this endpoint defines"},
		{name: "an unknown field", body: `{"colour":"red"}`, detail: "only the fields this endpoint defines"},
		{name: "a misspelled field", body: `{"mak":"Subaru"}`, detail: "only the fields this endpoint defines"},
		{name: "a second object", body: `{"make":"Subaru"}{"make":"Nissan"}`, detail: "The body must contain exactly one JSON object."},
		{name: "trailing junk", body: `{"make":"Subaru"}<<<`, detail: "The body must contain exactly one JSON object."},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			service := &fakeCarService{}

			recorder := patch(t, rest.NewCarHandler(service), uuid.New(), uuid.New().String(), tc.body)

			require.Equal(t, http.StatusBadRequest, recorder.Code)
			problem := decodePatchProblem(t, recorder)
			require.Equal(t, "/problems/malformed-body", problem.Type)
			require.Contains(t, problem.Detail, tc.detail)
			require.Zero(t, service.calls)
		})
	}
}

// Database rules reach the caller as the validation failures they are, and an
// unrecognised failure stays a 500 that says nothing about internals.
func TestUpdateCarReportsDatabaseRulesAndHidesTheRest(t *testing.T) {
	cases := []struct {
		name   string
		err    error
		status int
	}{
		{name: "an invalid usage type", err: domain.ErrInvalidUsageType, status: http.StatusUnprocessableEntity},
		{name: "an invalid year", err: domain.ErrInvalidYear, status: http.StatusUnprocessableEntity},
		{name: "no fields, caught late", err: domain.ErrNoFieldsToUpdate, status: http.StatusUnprocessableEntity},
		{name: "a deleted account", err: domain.ErrUnknownOwner, status: http.StatusUnauthorized},
		{name: "an unrecognised failure", err: errors.New(`violates check constraint "cars_year_check"`), status: http.StatusInternalServerError},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			service := &fakeCarService{err: tc.err}

			recorder := patchJSON(t, rest.NewCarHandler(service), uuid.New(), uuid.New().String(), map[string]any{"make": "Subaru"})

			require.Equal(t, tc.status, recorder.Code)
			require.Equal(t, "/v1/cars/", decodePatchProblem(t, recorder).Instance[:len("/v1/cars/")])
			require.NotContains(t, recorder.Body.String(), "cars_year_check")
		})
	}
}

func ptrTo[T any](v T) *T { return &v }

func decodePatchProblem(t *testing.T, recorder *httptest.ResponseRecorder) rest.Problem {
	t.Helper()

	require.Equal(t, "application/problem+json", recorder.Header().Get("Content-Type"))

	var problem rest.Problem
	require.NoError(t, json.Unmarshal(recorder.Body.Bytes(), &problem))
	require.Equal(t, recorder.Code, problem.Status)

	return problem
}

// The same short names POST accepts. A PATCH that renames a car to "MG Z" must
// not be refused by a rule the spec never had.
func TestUpdateCarAcceptsTheShortNamesRealCarsHave(t *testing.T) {
	service := &fakeCarService{}

	recorder := patchJSON(t, rest.NewCarHandler(service), uuid.New(), uuid.New().String(),
		map[string]any{"make": " MG ", "model": "Z", "engine": "V8"})

	require.Equal(t, http.StatusOK, recorder.Code, recorder.Body.String())
	require.Equal(t, "MG", *service.receivedUpdatedCar.Make, "trimmed before it reaches the service")
	require.Equal(t, "Z", *service.receivedUpdatedCar.Model)
	require.Equal(t, "V8", *service.receivedUpdatedCar.Engine)
}

// Notes emptied to whitespace in an edit form mean "clear them" — the same
// instruction as null, not a blank string stored as a note.
func TestUpdateCarTreatsWhitespaceNotesAsClearing(t *testing.T) {
	service := &fakeCarService{}

	recorder := patch(t, rest.NewCarHandler(service), uuid.New(), uuid.New().String(), `{"notes":"   "}`)

	require.Equal(t, http.StatusOK, recorder.Code)
	require.True(t, service.receivedUpdatedCar.Notes.Sent)
	require.Nil(t, service.receivedUpdatedCar.Notes.Value)
}
