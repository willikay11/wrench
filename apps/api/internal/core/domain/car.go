package domain

import (
	"errors"

	"github.com/google/uuid"
)

type Car struct {
	Id        uuid.UUID `json:"id"`
	UserId    uuid.UUID `json:"userId"`
	Make      string    `json:"make" validate:"required,min=3,max=50"`
	Model     string    `json:"model" validate:"required,min=3,max=50"`
	Year      int       `json:"year" validate:"required,gte=1885,lte=2030"`
	Engine    string    `json:"engine" validate:"required,min=3,max=100"`
	UsageType string    `json:"usageType" validate:"required,oneof=daily track show weekend off-road project"`
	Notes     string    `json:"notes" validate:"omitempty,min=3,max=1000"`
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

	// ErrUnknownOwner is not a field problem: it means the authenticated user
	// no longer exists, so the request is unauthenticated rather than invalid.
	ErrUnknownOwner = errors.New("unknown owner")
)
