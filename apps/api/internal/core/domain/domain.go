package domain

import "errors"

type Waitlist struct {
	ID    string `json:"id"`
	Email string `json:"email"`
}

type OutboxEmail struct {
	ID         string
	To         string
	Subject    string
	Body       string
	ProviderID string
	Status     OutboxStatus
	Attempts   int
}

type OutboxStatus string

const (
	OutboxStatusPending    OutboxStatus = "pending"
	OutboxStatusSent       OutboxStatus = "sent"
	OutboxStatusFailed     OutboxStatus = "failed"
	OutboxStatusRetrying   OutboxStatus = "retrying"
	OutboxStatusProcessing OutboxStatus = "processing"
)

var ErrInvalidEmail = errors.New("invalid email")

const WelcomeEmailSubject = "Welcome to the waitlist"
const WelcomeEmailBody = "Thank you for joining the waitlist."
