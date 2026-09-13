package rest

import (
	"errors"
	"net/http"
	"strconv"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/rs/zerolog/log"

	"github.com/willikay11/wrench/api/internal/core/domain"
	"github.com/willikay11/wrench/api/internal/core/ports"
)

type CatalogueHandler struct {
	catalogue ports.CatalogueService
}

func NewCatalogueHandler(catalogue ports.CatalogueService) *CatalogueHandler {
	return &CatalogueHandler{catalogue: catalogue}
}

// catalogueList is the envelope every catalogue listing uses. Data is never
// null: a search that finds nothing is a list with nothing in it.
type catalogueList[T any] struct {
	Data []T `json:"data"`
}

func listOf[T any](items []T) catalogueList[T] {
	if items == nil {
		items = []T{}
	}
	return catalogueList[T]{Data: items}
}

func (h *CatalogueHandler) SearchMakes(w http.ResponseWriter, r *http.Request) {
	search, ok := parseCatalogueSearch(w, r)
	if !ok {
		return
	}

	makes, err := h.catalogue.SearchMakes(r.Context(), search)
	if err != nil {
		withUser(log.Error().Err(err), r.Context()).Msg("Failed to search vehicle makes")
		serverProblem(w, r)
		return
	}

	writeJSON(w, http.StatusOK, listOf(makes))
}

func (h *CatalogueHandler) SearchModels(w http.ResponseWriter, r *http.Request) {
	makeId, err := uuid.Parse(chi.URLParam(r, "makeId"))
	if err != nil {
		writeProblem(w, r, catalogueNotFound("No make with that id."))
		return
	}

	search, ok := parseCatalogueSearch(w, r)
	if !ok {
		return
	}

	models, err := h.catalogue.SearchModels(r.Context(), makeId, search)
	if errors.Is(err, domain.ErrMakeNotFound) {
		writeProblem(w, r, catalogueNotFound("No make with that id."))
		return
	}
	if err != nil {
		withUser(log.Error().Err(err), r.Context()).Msg("Failed to search vehicle models")
		serverProblem(w, r)
		return
	}

	writeJSON(w, http.StatusOK, listOf(models))
}

func (h *CatalogueHandler) ListGenerations(w http.ResponseWriter, r *http.Request) {
	modelId, err := uuid.Parse(chi.URLParam(r, "modelId"))
	if err != nil {
		writeProblem(w, r, catalogueNotFound("No model with that id."))
		return
	}

	year, ok := parseYearFilter(w, r)
	if !ok {
		return
	}

	generations, err := h.catalogue.ListGenerations(r.Context(), modelId, year)
	if errors.Is(err, domain.ErrModelNotFound) {
		writeProblem(w, r, catalogueNotFound("No model with that id."))
		return
	}
	if err != nil {
		withUser(log.Error().Err(err), r.Context()).Msg("Failed to list vehicle generations")
		serverProblem(w, r)
		return
	}

	writeJSON(w, http.StatusOK, listOf(generations))
}

// parseCatalogueSearch reads q and limit, answering the request itself when
// either is unusable.
func parseCatalogueSearch(w http.ResponseWriter, r *http.Request) (domain.CatalogueSearch, bool) {
	params := r.URL.Query()

	limit, err := parseLimit(params)
	if err != nil {
		writeProblem(w, r, invalidQuery("limit", "This field must be a whole number between 1 and 50"))
		return domain.CatalogueSearch{}, false
	}

	search, err := domain.NewCatalogueSearch(params.Get("q"), limit)
	switch {
	case errors.Is(err, domain.ErrInvalidLimit):
		writeProblem(w, r, invalidQuery("limit", "This field must be a whole number between 1 and 50"))
		return domain.CatalogueSearch{}, false
	case errors.Is(err, domain.ErrSearchTooLong):
		writeProblem(w, r, invalidQuery("q", "This field must be at most 50 characters"))
		return domain.CatalogueSearch{}, false
	case err != nil:
		withUser(log.Error().Err(err), r.Context()).Msg("Failed to read catalogue search")
		serverProblem(w, r)
		return domain.CatalogueSearch{}, false
	}

	return search, true
}

// parseYearFilter reads the optional year. Absent means every generation; a
// value that is not a year a car can have is refused rather than ignored,
// because silently widening the filter would hand back generations the client
// did not ask for.
func parseYearFilter(w http.ResponseWriter, r *http.Request) (*int, bool) {
	params := r.URL.Query()
	if !params.Has("year") {
		return nil, true
	}

	year, err := strconv.Atoi(params.Get("year"))
	if err != nil || !domain.ValidCarYear(year) {
		writeProblem(w, r, invalidQuery("year", "This field must be a whole number between 1885 and 2030"))
		return nil, false
	}

	return &year, true
}

func invalidQuery(name, reason string) Problem {
	return Problem{
		Type:          typeValidationFailed,
		Title:         "The request could not be read",
		Status:        http.StatusUnprocessableEntity,
		InvalidParams: []InvalidParam{{Name: name, Reason: reason}},
	}
}

func catalogueNotFound(detail string) Problem {
	return Problem{Status: http.StatusNotFound, Detail: detail}
}
