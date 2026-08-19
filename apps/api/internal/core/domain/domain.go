package domain

import "errors"

type Waitlist struct {
	ID    string `json:"id"`
	Email string `json:"email"`
}

var ErrInvalidEmail = errors.New("invalid email")
var WelcomEmailSubject = "Welcome to the waitlist"
var WelcomEmailBody = "Thank you for joining the waitlist."
