package domain

import "errors"

// OutboxEmail is a queued email as the dispatcher sees it. Attempts drives the
// retry ceiling, so it must be populated by whatever claims the row.
type OutboxEmail struct {
	ID         string
	To         string
	Subject    string
	Body       string
	ProviderID string
	Status     OutboxStatus
	Attempts   int
}

// EmailMessage is one outbound email handed to a provider. IdempotencyKey is
// the outbox row ID: delivery is at-least-once, so the same row can be sent
// twice after a crash between the send and the status write. The key lets the
// provider collapse those into one delivery.
type EmailMessage struct {
	IdempotencyKey string
	To             string
	Subject        string
	Body           string
}

type OutboxStatus string

const (
	OutboxStatusPending    OutboxStatus = "pending"
	OutboxStatusSent       OutboxStatus = "sent"
	OutboxStatusFailed     OutboxStatus = "failed"
	OutboxStatusProcessing OutboxStatus = "processing"
)

// Delivery outcome classes. Adapters wrap their vendor errors with one of
// these so the dispatch policy can choose between retrying and giving up
// without knowing which provider produced the failure.
var (
	// ErrEmailPermanent means retrying sends the identical request and will
	// fail identically — a malformed address, a rejected payload.
	ErrEmailPermanent = errors.New("permanent email delivery failure")

	// ErrEmailTransient means the same request may well succeed later — rate
	// limits, provider outages, network faults.
	ErrEmailTransient = errors.New("transient email delivery failure")
)
