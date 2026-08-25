package domain

import "errors"

type Waitlist struct {
	ID    string `json:"id"`
	Email string `json:"email"`

	// IsNew reports whether Save actually created this row, as opposed to
	// touching one that already existed. Signing up twice must not queue a
	// second welcome email. Not part of any API response.
	IsNew bool `json:"-"`
}

var ErrInvalidEmail = errors.New("invalid email")

const WelcomeEmailSubject = "Welcome to the waitlist"
const WelcomeEmailTemplateId = "welcome-to-wrench"
