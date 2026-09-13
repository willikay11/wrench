package rest

import (
	"net/http"
	"net/url"
	"strconv"
	"time"

	"github.com/google/uuid"
	"github.com/rs/zerolog/log"

	"github.com/willikay11/wrench/api/internal/core/domain"
)

// CarSummary is the list view of a car. Narrower than the full car on purpose:
// a garage list does not need notes, and sending less is the difference
// between a fast list and a slow one once notes are long.
//
// primaryPhotoUrl and modCount belong here per the API spec but need the photos
// and modifications tables, which do not exist yet.
type CarSummary struct {
	Id        string `json:"id"`
	Make      string `json:"make"`
	Model     string `json:"model"`
	Year      int    `json:"year"`
	Engine    string `json:"engine"`
	UsageType string `json:"usageType"`
	CreatedAt string `json:"createdAt"`

	// The car's catalogue link, null for a car with none. The garage draws its
	// silhouette from BodyStyle when the car has no photo.
	GenerationId *string `json:"generationId"`
	BodyStyle    *string `json:"bodyStyle"`
}

// CursorPagination tells a client whether to ask again and with what.
type CursorPagination struct {
	// NextCursor is null on the last page, which is how a client knows to stop.
	NextCursor *string `json:"nextCursor"`
	HasMore    bool    `json:"hasMore"`
	Total      int     `json:"total"`
}

type CarListResponse struct {
	Data       []CarSummary     `json:"data"`
	Pagination CursorPagination `json:"pagination"`
}

func (h *CarHandler) ListCars(w http.ResponseWriter, r *http.Request) {
	params := r.URL.Query()

	limit, err := parseLimit(params)
	if err != nil {
		writeProblem(w, r, Problem{
			Type:          typeValidationFailed,
			Title:         "The request could not be read",
			Status:        http.StatusUnprocessableEntity,
			InvalidParams: []InvalidParam{{Name: "limit", Reason: "This field must be a whole number between 1 and 50"}},
		})
		return
	}

	cursor, err := parseCursor(params)
	if err != nil {
		// Refused rather than reset to the first page: a client handed page one
		// for a cursor it believes in would page forever without finishing.
		writeProblem(w, r, Problem{
			Type:          typeValidationFailed,
			Title:         "The request could not be read",
			Status:        http.StatusUnprocessableEntity,
			InvalidParams: []InvalidParam{{Name: "cursor", Reason: "This cursor could not be read. Omit it to start from the first page"}},
		})
		return
	}

	// The owner is the token's, never the query string's. There is no userId
	// parameter to supply, and the cursor carries only a position.
	query, err := domain.NewCarQuery(domain.MustUserID(r.Context()), limit, cursor)
	if err != nil {
		writeProblem(w, r, Problem{
			Type:          typeValidationFailed,
			Title:         "The request could not be read",
			Status:        http.StatusUnprocessableEntity,
			InvalidParams: []InvalidParam{{Name: "limit", Reason: "This field must be a whole number between 1 and 50"}},
		})
		return
	}

	page, err := h.carService.ListCars(r.Context(), query)
	if err != nil {
		withUser(log.Error().Err(err), r.Context()).Msg("Failed to list cars")
		serverProblem(w, r)
		return
	}

	writeJSON(w, http.StatusOK, carListResponse(page))
}

// parseLimit reads the limit parameter. An absent limit is not an error — it
// means the default — but "?limit=" is: the client named the parameter and gave
// nothing readable, which is a bug on its side that a silent default would
// hide. Has, not Get, is what tells those two apart.
func parseLimit(params url.Values) (*int, error) {
	if !params.Has("limit") {
		return nil, nil
	}

	limit, err := strconv.Atoi(params.Get("limit"))
	if err != nil {
		return nil, domain.ErrInvalidLimit
	}

	return &limit, nil
}

// parseCursor reads the cursor parameter. Absent means the first page; present
// and unreadable is refused for the same reason as the limit.
func parseCursor(params url.Values) (*domain.CarCursor, error) {
	if !params.Has("cursor") {
		return nil, nil
	}

	cursor, err := domain.DecodeCarCursor(params.Get("cursor"))
	if err != nil {
		return nil, err
	}

	return &cursor, nil
}

// carListResponse renders a page for the wire. data is built with make so an
// empty garage serialises as [] rather than null — a client iterating the
// result should not have to special-case the empty case.
func carListResponse(page domain.CarPage) CarListResponse {
	summaries := make([]CarSummary, 0, len(page.Cars))
	for _, car := range page.Cars {
		summaries = append(summaries, CarSummary{
			Id:           car.Id.String(),
			Make:         car.Make,
			Model:        car.Model,
			Year:         car.Year,
			Engine:       car.Engine,
			UsageType:    car.UsageType,
			CreatedAt:    car.CreatedAt.UTC().Format(time.RFC3339Nano),
			GenerationId: idString(car.GenerationId),
			BodyStyle:    car.BodyStyle,
		})
	}

	response := CarListResponse{
		Data:       summaries,
		Pagination: CursorPagination{HasMore: page.HasMore, Total: page.Total},
	}

	if page.NextCursor != nil {
		encoded := page.NextCursor.Encode()
		response.Pagination.NextCursor = &encoded
	}

	return response
}

func idString(id *uuid.UUID) *string {
	if id == nil {
		return nil
	}
	value := id.String()
	return &value
}
