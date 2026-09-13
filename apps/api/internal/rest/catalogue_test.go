package rest_test

import (
	"context"
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
The catalogue endpoints read query parameters, refuse what they cannot use, and
render lists. What rows a search returns is a property of the SQL, covered
against a real database in internal/postgres; here the subject is the HTTP
contract.
*/

type fakeCatalogue struct {
	calls      int
	lastSearch domain.CatalogueSearch
	lastMake   uuid.UUID
	lastModel  uuid.UUID
	lastYear   *int

	makes       []domain.VehicleMake
	models      []domain.VehicleModel
	generations []domain.VehicleGeneration
	err         error
}

func (f *fakeCatalogue) SearchMakes(_ context.Context, search domain.CatalogueSearch) ([]domain.VehicleMake, error) {
	f.calls++
	f.lastSearch = search
	return f.makes, f.err
}

func (f *fakeCatalogue) SearchModels(_ context.Context, makeId uuid.UUID, search domain.CatalogueSearch) ([]domain.VehicleModel, error) {
	f.calls++
	f.lastMake, f.lastSearch = makeId, search
	return f.models, f.err
}

func (f *fakeCatalogue) ListGenerations(_ context.Context, modelId uuid.UUID, year *int) ([]domain.VehicleGeneration, error) {
	f.calls++
	f.lastModel, f.lastYear = modelId, year
	return f.generations, f.err
}

func getCatalogue(t *testing.T, fake *fakeCatalogue, target string) *httptest.ResponseRecorder {
	t.Helper()

	handler := rest.NewCatalogueHandler(fake)
	router := chi.NewRouter()
	router.Get("/v1/catalogue/makes", handler.SearchMakes)
	router.Get("/v1/catalogue/makes/{makeId}/models", handler.SearchModels)
	router.Get("/v1/catalogue/models/{modelId}/generations", handler.ListGenerations)

	request := httptest.NewRequest(http.MethodGet, target, nil)
	request = request.WithContext(domain.WithUserID(request.Context(), uuid.New()))

	recorder := httptest.NewRecorder()
	router.ServeHTTP(recorder, request)

	return recorder
}

func catalogueProblem(t *testing.T, recorder *httptest.ResponseRecorder) rest.Problem {
	t.Helper()

	require.Equal(t, "application/problem+json", recorder.Header().Get("Content-Type"))

	var problem rest.Problem
	require.NoError(t, json.Unmarshal(recorder.Body.Bytes(), &problem))
	require.Equal(t, recorder.Code, problem.Status)

	return problem
}

func TestSearchMakesPassesTheSearchThrough(t *testing.T) {
	fake := &fakeCatalogue{makes: []domain.VehicleMake{{Id: uuid.New(), Name: "Nissan"}}}

	recorder := getCatalogue(t, fake, "/v1/catalogue/makes?q=%20nis%20&limit=5")

	require.Equal(t, http.StatusOK, recorder.Code)
	require.Equal(t, "nis", fake.lastSearch.Text, "trimmed before it reaches the service")
	require.Equal(t, 5, fake.lastSearch.Limit)

	var body struct {
		Data []domain.VehicleMake `json:"data"`
	}
	require.NoError(t, json.Unmarshal(recorder.Body.Bytes(), &body))
	require.Equal(t, "Nissan", body.Data[0].Name)
}

// A search that finds nothing is a list with nothing in it, and a client
// iterating data should not have to special-case null.
func TestCatalogueListsRenderEmptyAsAnArray(t *testing.T) {
	for _, target := range []string{
		"/v1/catalogue/makes?q=nothing",
		"/v1/catalogue/makes/" + uuid.NewString() + "/models",
		"/v1/catalogue/models/" + uuid.NewString() + "/generations",
	} {
		recorder := getCatalogue(t, &fakeCatalogue{}, target)

		require.Equal(t, http.StatusOK, recorder.Code, target)
		require.JSONEq(t, `{"data":[]}`, recorder.Body.String(), target)
	}
}

func TestCatalogueSearchRefusesALimitOutsideTheRange(t *testing.T) {
	for _, limit := range []string{"0", "51", "abc", ""} {
		fake := &fakeCatalogue{}

		recorder := getCatalogue(t, fake, "/v1/catalogue/makes?limit="+limit)

		require.Equal(t, http.StatusUnprocessableEntity, recorder.Code, "limit %q", limit)
		require.Equal(t, "limit", catalogueProblem(t, recorder).InvalidParams[0].Name)
		require.Zero(t, fake.calls)
	}
}

func TestCatalogueSearchRefusesTextThatIsTooLong(t *testing.T) {
	fake := &fakeCatalogue{}

	recorder := getCatalogue(t, fake, "/v1/catalogue/makes?q="+strings.Repeat("x", 51))

	require.Equal(t, http.StatusUnprocessableEntity, recorder.Code)
	require.Equal(t, []rest.InvalidParam{{Name: "q", Reason: "This field must be at most 50 characters"}},
		catalogueProblem(t, recorder).InvalidParams)
	require.Zero(t, fake.calls)
}

func TestSearchModelsScopesToThePathMake(t *testing.T) {
	makeId := uuid.New()
	fake := &fakeCatalogue{}

	recorder := getCatalogue(t, fake, "/v1/catalogue/makes/"+makeId.String()+"/models?q=350")

	require.Equal(t, http.StatusOK, recorder.Code)
	require.Equal(t, makeId, fake.lastMake)
	require.Equal(t, "350", fake.lastSearch.Text)
}

func TestSearchModelsAnswersAnUnknownOrMalformedMakeAsNotFound(t *testing.T) {
	t.Run("malformed", func(t *testing.T) {
		fake := &fakeCatalogue{}
		recorder := getCatalogue(t, fake, "/v1/catalogue/makes/not-a-uuid/models")

		require.Equal(t, http.StatusNotFound, recorder.Code)
		require.Zero(t, fake.calls)
	})

	t.Run("unknown", func(t *testing.T) {
		recorder := getCatalogue(t, &fakeCatalogue{err: domain.ErrMakeNotFound},
			"/v1/catalogue/makes/"+uuid.NewString()+"/models")

		require.Equal(t, http.StatusNotFound, recorder.Code)
		require.Equal(t, "No make with that id.", catalogueProblem(t, recorder).Detail)
	})
}

func TestListGenerationsPassesTheYearThrough(t *testing.T) {
	fake := &fakeCatalogue{}

	recorder := getCatalogue(t, fake, "/v1/catalogue/models/"+uuid.NewString()+"/generations?year=2003")

	require.Equal(t, http.StatusOK, recorder.Code)
	require.NotNil(t, fake.lastYear)
	require.Equal(t, 2003, *fake.lastYear)
}

func TestListGenerationsWithoutAYearAsksForEveryGeneration(t *testing.T) {
	fake := &fakeCatalogue{}

	recorder := getCatalogue(t, fake, "/v1/catalogue/models/"+uuid.NewString()+"/generations")

	require.Equal(t, http.StatusOK, recorder.Code)
	require.Nil(t, fake.lastYear)
}

// Refused rather than ignored: dropping a bad year would widen the filter and
// return generations the client did not ask for.
func TestListGenerationsRefusesAYearACarCannotHave(t *testing.T) {
	for _, year := range []string{"1884", "2031", "abc", "", "2003.5"} {
		fake := &fakeCatalogue{}

		recorder := getCatalogue(t, fake, "/v1/catalogue/models/"+uuid.NewString()+"/generations?year="+year)

		require.Equal(t, http.StatusUnprocessableEntity, recorder.Code, "year %q", year)
		require.Equal(t, "year", catalogueProblem(t, recorder).InvalidParams[0].Name)
		require.Zero(t, fake.calls)
	}
}

func TestListGenerationsAnswersAnUnknownModelAsNotFound(t *testing.T) {
	recorder := getCatalogue(t, &fakeCatalogue{err: domain.ErrModelNotFound},
		"/v1/catalogue/models/"+uuid.NewString()+"/generations")

	require.Equal(t, http.StatusNotFound, recorder.Code)
}

// The credit is part of the image's shape on the wire, and the stored public
// id is not.
func TestListGenerationsRendersAnImageWithItsAttribution(t *testing.T) {
	end := 2009
	code := "Z33"
	fake := &fakeCatalogue{generations: []domain.VehicleGeneration{{
		Id: uuid.New(), StartYear: 2002, EndYear: &end, Code: &code, BodyStyle: "coupe",
		Image: &domain.CatalogueImage{
			PublicId: "wrench/catalogue/secret-id", Url: "https://images.test/z33",
			Attribution: "Photo by Someone", License: "CC BY-SA 4.0", SourceUrl: "https://commons.example/z33",
		},
	}}}

	recorder := getCatalogue(t, fake, "/v1/catalogue/models/"+uuid.NewString()+"/generations")

	require.Equal(t, http.StatusOK, recorder.Code)
	body := recorder.Body.String()
	require.Contains(t, body, `"attribution":"Photo by Someone"`)
	require.Contains(t, body, `"license":"CC BY-SA 4.0"`)
	require.Contains(t, body, `"url":"https://images.test/z33"`)
	require.NotContains(t, body, "secret-id", "the stored public id never leaves the server")
}

func TestCatalogueHidesServiceFailures(t *testing.T) {
	recorder := getCatalogue(t, &fakeCatalogue{err: errors.New("dial tcp: connection refused")},
		"/v1/catalogue/makes")

	require.Equal(t, http.StatusInternalServerError, recorder.Code)
	require.NotContains(t, recorder.Body.String(), "connection refused")
}
