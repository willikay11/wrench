package domain

import (
	"errors"
	"strings"
	"unicode/utf8"

	"github.com/google/uuid"
)

// Catalogue search limits. The ceiling bounds one request; the default is what
// an autocomplete list shows before anyone would scroll.
const (
	DefaultCatalogueResults  = 20
	MaxCatalogueResults      = 50
	MaxCatalogueSearchLength = 50
)

// The years a car can have. The cars table and every catalogue generation are
// held to the same range by CHECK constraints.
const (
	MinCarYear = 1885
	MaxCarYear = 2030
)

var (
	ErrMakeNotFound      = errors.New("vehicle make not found")
	ErrModelNotFound     = errors.New("vehicle model not found")
	ErrSearchTooLong     = errors.New("search text too long")
	ErrUnknownGeneration = errors.New("catalogue generation not found")
)

// BodyStyles a generation can have. The same list is a CHECK constraint on
// vehicleGenerations, and the garage draws one silhouette per style.
var BodyStyles = []string{"coupe", "sedan", "hatchback", "wagon", "convertible", "suv", "pickup", "van"}

type VehicleMake struct {
	Id   uuid.UUID `json:"id"`
	Name string    `json:"name"`
}

type VehicleModel struct {
	Id     uuid.UUID `json:"id"`
	MakeId uuid.UUID `json:"makeId"`
	Name   string    `json:"name"`
}

// CatalogueImage is a representative image and the terms it is shown under.
//
// The attribution travels with the URL on purpose: the licences these images
// come under require credit, so an image that reaches a client without its
// attribution is one we are no longer entitled to show. PublicId is the stored
// reference and never leaves the server.
type CatalogueImage struct {
	PublicId    string `json:"-"`
	Url         string `json:"url"`
	Attribution string `json:"attribution"`
	License     string `json:"license"`
	SourceUrl   string `json:"sourceUrl"`
}

type VehicleGeneration struct {
	Id        uuid.UUID       `json:"id"`
	ModelId   uuid.UUID       `json:"modelId"`
	Code      *string         `json:"code"`
	StartYear int             `json:"startYear"`
	EndYear   *int            `json:"endYear"`
	BodyStyle string          `json:"bodyStyle"`
	Image     *CatalogueImage `json:"image"`
}

// Covers reports whether a model year falls within the generation. A nil end
// year is a generation still in production.
func (g VehicleGeneration) Covers(year int) bool {
	return year >= g.StartYear && (g.EndYear == nil || year <= *g.EndYear)
}

// ValidCarYear reports whether a year is one a car can have.
func ValidCarYear(year int) bool {
	return year >= MinCarYear && year <= MaxCarYear
}

// CatalogueSearch is a validated search: trimmed text and a limit inside the
// allowed range. Built only through NewCatalogueSearch, so the repository
// never has to re-check either.
type CatalogueSearch struct {
	Text  string
	Limit int
}

// NewCatalogueSearch validates what a client asked for. An absent limit takes
// the default; one outside 1–50 is refused rather than clamped, matching the
// car list, because a silently different page size hides a client bug.
func NewCatalogueSearch(text string, limit *int) (CatalogueSearch, error) {
	text = strings.TrimSpace(text)
	if utf8.RuneCountInString(text) > MaxCatalogueSearchLength {
		return CatalogueSearch{}, ErrSearchTooLong
	}

	size := DefaultCatalogueResults
	if limit != nil {
		if *limit < 1 || *limit > MaxCatalogueResults {
			return CatalogueSearch{}, ErrInvalidLimit
		}
		size = *limit
	}

	return CatalogueSearch{Text: text, Limit: size}, nil
}

// GenerationMatch is a generation with the names of the make and model it
// belongs to: everything a car has to agree with to link to it.
type GenerationMatch struct {
	Generation VehicleGeneration
	MakeName   string
	ModelName  string
}

// Disagreements lists the fields in which a car differs from the generation it
// would link to, in the order a form shows them.
//
// Names compare without regard to case or surrounding space — "nissan" is
// Nissan — but otherwise exactly. A link that tolerated a different model would
// be a link to the wrong image.
func (m GenerationMatch) Disagreements(carMake, carModel string, year int) []string {
	var fields []string

	if !strings.EqualFold(strings.TrimSpace(carMake), m.MakeName) {
		fields = append(fields, "make")
	}
	if !strings.EqualFold(strings.TrimSpace(carModel), m.ModelName) {
		fields = append(fields, "model")
	}
	if !m.Generation.Covers(year) {
		fields = append(fields, "year")
	}

	return fields
}

// GenerationMismatchError is a car that disagrees with the generation it would
// link to. It carries the generation's years so the caller can say which years
// would do, rather than only that this one does not.
type GenerationMismatchError struct {
	Fields    []string
	StartYear int
	EndYear   *int
}

func (e *GenerationMismatchError) Error() string {
	return "car does not match its catalogue generation: " + strings.Join(e.Fields, ", ")
}
