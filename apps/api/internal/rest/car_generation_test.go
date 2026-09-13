package rest_test

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/stretchr/testify/require"

	"github.com/willikay11/wrench/api/internal/core/domain"
	"github.com/willikay11/wrench/api/internal/rest"
)

/*
The HTTP half of a car's catalogue link: generationId travels in on POST and
PATCH, a refused link comes back on the fields it concerns, and every car in a
list carries its link and body style. Whether a link is valid is the service's
decision and is tested there.
*/

func TestCreateCarPassesTheGenerationLinkThrough(t *testing.T) {
	service := &fakeCarService{}
	generation := uuid.New()

	body := validCar()
	body["generationId"] = generation.String()

	recorder := postJSON(t, rest.NewCarHandler(service), uuid.New(), body)

	require.Equal(t, http.StatusCreated, recorder.Code, recorder.Body.String())
	require.NotNil(t, service.received.GenerationId)
	require.Equal(t, generation, *service.received.GenerationId)
}

func TestCreateCarWithoutALinkSendsNone(t *testing.T) {
	service := &fakeCarService{}

	recorder := postJSON(t, rest.NewCarHandler(service), uuid.New(), validCar())

	require.Equal(t, http.StatusCreated, recorder.Code)
	require.Nil(t, service.received.GenerationId)
}

func TestCreateCarReportsAMismatchOnEachFieldThatDisagrees(t *testing.T) {
	end := 2009
	service := &fakeCarService{err: &domain.GenerationMismatchError{
		Fields: []string{"make", "year"}, StartYear: 2002, EndYear: &end,
	}}

	recorder := postJSON(t, rest.NewCarHandler(service), uuid.New(), validCar())

	require.Equal(t, http.StatusUnprocessableEntity, recorder.Code)
	problem := decodeProblem(t, recorder)
	require.Equal(t, "/problems/validation-failed", problem.Type)
	require.Equal(t, []rest.InvalidParam{
		{Name: "make", Reason: "This make does not match the linked catalogue generation"},
		{Name: "year", Reason: "This year must be between 2002 and 2009 for the linked generation"},
	}, problem.InvalidParams)
}

// A generation still in production has no upper year to name.
func TestCreateCarNamesOnlyTheStartYearOfAnOngoingGeneration(t *testing.T) {
	service := &fakeCarService{err: &domain.GenerationMismatchError{Fields: []string{"year"}, StartYear: 2015}}

	recorder := postJSON(t, rest.NewCarHandler(service), uuid.New(), validCar())

	require.Equal(t, http.StatusUnprocessableEntity, recorder.Code)
	require.Equal(t, "This year must be 2015 or later for the linked generation",
		decodeProblem(t, recorder).InvalidParams[0].Reason)
}

func TestCreateCarReportsAnUnknownGenerationOnGenerationId(t *testing.T) {
	service := &fakeCarService{err: domain.ErrUnknownGeneration}

	recorder := postJSON(t, rest.NewCarHandler(service), uuid.New(), validCar())

	require.Equal(t, http.StatusUnprocessableEntity, recorder.Code)
	require.Equal(t, []rest.InvalidParam{{Name: "generationId", Reason: "This generation does not exist in the catalogue"}},
		decodeProblem(t, recorder).InvalidParams)
}

// Not a uuid is a body the handler cannot decode, the same 400 as any other
// field of the wrong type.
func TestCreateCarRefusesAMalformedGenerationId(t *testing.T) {
	service := &fakeCarService{}

	body := validCar()
	body["generationId"] = "not-a-uuid"

	recorder := postJSON(t, rest.NewCarHandler(service), uuid.New(), body)

	require.Equal(t, http.StatusBadRequest, recorder.Code)
	require.Zero(t, service.calls)
}

func TestUpdateCarCarriesTheThreeStatesOfTheLink(t *testing.T) {
	generation := uuid.New()

	cases := []struct {
		name      string
		body      string
		wantSent  bool
		wantValue *uuid.UUID
	}{
		{name: "absent leaves the link alone", body: `{"engine":"V8"}`, wantSent: false},
		{name: "null unlinks", body: `{"generationId":null}`, wantSent: true, wantValue: nil},
		{name: "a value links", body: `{"generationId":"` + generation.String() + `"}`, wantSent: true, wantValue: &generation},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			service := &fakeCarService{}

			recorder := patch(t, rest.NewCarHandler(service), uuid.New(), uuid.New().String(), tc.body)

			require.Equal(t, http.StatusOK, recorder.Code, recorder.Body.String())
			require.Equal(t, tc.wantSent, service.receivedUpdatedCar.GenerationId.Sent)
			require.Equal(t, tc.wantValue, service.receivedUpdatedCar.GenerationId.Value)
		})
	}
}

// A body whose only instruction is to unlink is a real change, not an empty
// patch.
func TestUpdateCarCountsUnlinkingAsAChange(t *testing.T) {
	service := &fakeCarService{}

	recorder := patch(t, rest.NewCarHandler(service), uuid.New(), uuid.New().String(), `{"generationId":null}`)

	require.Equal(t, http.StatusOK, recorder.Code)
	require.Equal(t, 1, service.calls)
}

func TestUpdateCarReportsAMismatchOnTheFieldsThatDisagree(t *testing.T) {
	end := 2009
	service := &fakeCarService{err: &domain.GenerationMismatchError{
		Fields: []string{"year"}, StartYear: 2002, EndYear: &end,
	}}

	recorder := patchJSON(t, rest.NewCarHandler(service), uuid.New(), uuid.New().String(), map[string]any{"year": 2015})

	require.Equal(t, http.StatusUnprocessableEntity, recorder.Code)
	require.Equal(t, []rest.InvalidParam{
		{Name: "year", Reason: "This year must be between 2002 and 2009 for the linked generation"},
	}, decodePatchProblem(t, recorder).InvalidParams)
}

func TestListCarsRendersEachCarsLinkAndBodyStyle(t *testing.T) {
	generation := uuid.New()
	coupe := "coupe"
	linked := domain.Car{Id: uuid.New(), Make: "Nissan", Model: "350Z", Year: 2005, CreatedAt: time.Now(),
		GenerationId: &generation, BodyStyle: &coupe}
	unlinked := domain.Car{Id: uuid.New(), Make: "Kit", Model: "Car", Year: 2005, CreatedAt: time.Now()}

	service := &fakeCarService{page: domain.CarPage{Cars: []domain.Car{linked, unlinked}, Total: 2}}

	request := httptest.NewRequest(http.MethodGet, "/v1/cars", nil)
	request = request.WithContext(domain.WithUserID(request.Context(), uuid.New()))
	recorder := httptest.NewRecorder()
	rest.NewCarHandler(service).ListCars(recorder, request)

	require.Equal(t, http.StatusOK, recorder.Code)

	var body struct {
		Data []map[string]any `json:"data"`
	}
	require.NoError(t, json.Unmarshal(recorder.Body.Bytes(), &body))

	require.Equal(t, generation.String(), body.Data[0]["generationId"])
	require.Equal(t, "coupe", body.Data[0]["bodyStyle"])

	// Present and null, so a client finds an explicit "no link" rather than a
	// missing key.
	require.Contains(t, body.Data[1], "generationId")
	require.Nil(t, body.Data[1]["generationId"])
	require.Contains(t, body.Data[1], "bodyStyle")
	require.Nil(t, body.Data[1]["bodyStyle"])
}
