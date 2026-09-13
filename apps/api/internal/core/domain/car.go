package domain

import (
	"encoding/json"
	"errors"
	"strings"
	"time"

	"github.com/google/uuid"
)

type Car struct {
	Id        uuid.UUID `json:"id"`
	UserId    uuid.UUID `json:"userId"`
	Make      string    `json:"make" validate:"required,max=50"`
	Model     string    `json:"model" validate:"required,max=50"`
	Year      int       `json:"year" validate:"required,gte=1885,lte=2030"`
	Engine    string    `json:"engine" validate:"required,max=100"`
	UsageType string    `json:"usageType" validate:"required,oneof=daily track show weekend off-road project"`
	Notes     string    `json:"notes" validate:"omitempty,max=1000"`

	// GenerationId links the car to a catalogue generation (ADR-010). Optional:
	// a car the catalogue does not know is still a car. When set, the car's
	// make, model and year must agree with the generation.
	GenerationId *uuid.UUID `json:"generationId"`

	// BodyStyle is the linked generation's, read back from the database with
	// the row. A value a client sends is overwritten, like the timestamps.
	BodyStyle *string `json:"bodyStyle"`

	// Photo is the image the car is shown with, resolved by the service from
	// the stored references below. A value a client sends is overwritten.
	Photo *CarPhoto `json:"photo"`

	// The stored references Photo is resolved from. Never sent to a client: the
	// uploaded photo's public id, and the linked generation's catalogue image.
	PhotoPublicId  *string         `json:"-"`
	CatalogueImage *CatalogueImage `json:"-"`

	// Set by the database, never by the caller: both are filled from the
	// statement's RETURNING clause, so anything a client sends under these
	// names is overwritten before the car leaves the repository.
	CreatedAt time.Time `json:"createdAt"`
	UpdatedAt time.Time `json:"updatedAt"`
}

// Normalize trims the car's free-text fields, and must run before validation.
//
// There is no minimum length on make, model or engine, because real cars do not
// have one: BMW M3, Nissan Z, Toyota 86, MG, a V8. What is never a value is
// whitespace, so it is trimmed first — "   " then fails required, and
// "  Nissan " is stored as "Nissan" rather than as a second spelling of it.
func (c *Car) Normalize() {
	c.Make = strings.TrimSpace(c.Make)
	c.Model = strings.TrimSpace(c.Model)
	c.Engine = strings.TrimSpace(c.Engine)
	c.UsageType = strings.TrimSpace(c.UsageType)
	c.Notes = strings.TrimSpace(c.Notes)
}

// Nullable carries the three states a PATCH body can express for one field:
// absent, present with a value, and present as JSON null. A plain pointer only
// carries two — an omitted key and an explicit null both decode to nil — which
// is the difference between "leave this alone" and "clear this".
type Nullable[T any] struct {
	// Sent reports that the key appeared in the body at all.
	Sent bool
	// Value is nil when the key was sent as null.
	Value *T
}

// UnmarshalJSON is only called for a key that is present, which is what makes
// Sent meaningful: a field the body omitted is left at its zero value.
func (n *Nullable[T]) UnmarshalJSON(data []byte) error {
	n.Sent = true

	if string(data) == "null" {
		n.Value = nil
		return nil
	}

	var value T
	if err := json.Unmarshal(data, &value); err != nil {
		return err
	}
	n.Value = &value

	return nil
}

// Get returns the value and whether there is one to write.
func (n Nullable[T]) Get() (T, bool) {
	var zero T
	if n.Value == nil {
		return zero, false
	}
	return *n.Value, true
}

// UpdateCar is a partial update: every field is optional, and a field left out
// is not written at all. Only notes is nullable in the schema, so it is the
// only one that needs all three states; the rest cannot meaningfully be set to
// null and use a plain pointer.
type UpdateCar struct {
	Id     uuid.UUID `json:"id"`
	UserId uuid.UUID `json:"userId"`

	Make      *string `json:"make" validate:"omitempty,notblank,max=50"`
	Model     *string `json:"model" validate:"omitempty,notblank,max=50"`
	Year      *int    `json:"year" validate:"omitempty,gte=1885,lte=2030"`
	Engine    *string `json:"engine" validate:"omitempty,notblank,max=100"`
	UsageType *string `json:"usageType" validate:"omitempty,oneof=daily track show weekend off-road project"`

	Notes Nullable[string] `json:"notes" validate:"omitempty,max=1000"`

	// GenerationId is tri-state like notes: absent leaves the link as it is,
	// null unlinks the car, and a value links it. Not validated here — whether
	// the generation exists and agrees with the car is a catalogue question, and
	// the service answers it.
	GenerationId Nullable[uuid.UUID] `json:"generationId" validate:"-"`
}

// Normalize trims the fields the body carried, and must run before validation.
//
// A field left out stays nil, so "not mentioned" is never confused with "set to
// blank". A field sent as whitespace trims to "", which the notblank rule then
// refuses — a PATCH cannot blank a car's make. Notes are the exception: they
// are optional, so notes emptied to whitespace are an instruction to clear
// them, the same as sending null.
func (u *UpdateCar) Normalize() {
	for _, field := range []*string{u.Make, u.Model, u.Engine, u.UsageType} {
		if field != nil {
			*field = strings.TrimSpace(*field)
		}
	}

	if u.Notes.Value != nil {
		trimmed := strings.TrimSpace(*u.Notes.Value)
		if trimmed == "" {
			u.Notes.Value = nil
		} else {
			u.Notes.Value = &trimmed
		}
	}
}

// HasChanges reports whether the body asked for anything to be written. A
// PATCH that names no field is a client mistake rather than a no-op: nothing
// it intended has happened, and a 200 would say otherwise.
func (u UpdateCar) HasChanges() bool {
	return u.Make != nil || u.Model != nil || u.Year != nil ||
		u.Engine != nil || u.UsageType != nil || u.Notes.Sent || u.GenerationId.Sent
}

// The database enforces these same rules as a backstop, so a Save can fail
// with one even though the validate tags above passed — a NOT NULL or a length
// limit reached at write time means something got past validation, and the
// caller is told which rule rather than being handed a bare 500.
var (
	ErrInvalidUsageType = errors.New("invalid usage type")
	ErrInvalidYear      = errors.New("invalid year")
	ErrMissingField     = errors.New("missing required field")
	ErrFieldTooLong     = errors.New("field too long")
	ErrCarNotFound      = errors.New("car not found")
	ErrNoFieldsToUpdate = errors.New("no fields to update")
	// ErrUnknownOwner is not a field problem: it means the authenticated user
	// no longer exists, so the request is unauthenticated rather than invalid.
	ErrUnknownOwner = errors.New("unknown owner")
)
