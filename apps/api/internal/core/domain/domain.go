package domain

import "errors"

type Waitlist struct {
	ID    string `json:"id"`
	Email string `json:"email"`
}

var ErrInvalidEmail = errors.New("invalid email")
