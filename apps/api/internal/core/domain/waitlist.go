package domain

import "errors"

type Waitlist struct {
	ID    string `json:"id"`
	Email string `json:"email"`
}

var ErrInvalidEmail = errors.New("invalid email")

const WelcomeEmailSubject = "Welcome to the waitlist"
const WelcomeEmailBody = "Thank you for joining the waitlist."
