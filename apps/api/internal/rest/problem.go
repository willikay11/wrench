package rest

import (
	"encoding/json"
	"net/http"

	"github.com/rs/zerolog/log"
)

// problemContentType is the media type RFC 7807 defines for these bodies. It
// is what tells a client the payload is a problem rather than the resource it
// asked for, so it must be sent even when the body looks like plain JSON.
const problemContentType = "application/problem+json"

// Problem types. RFC 7807 wants a URI reference that identifies the problem
// kind; relative references resolve against the request URL, so these stay
// correct without hardcoding a host, and can later point at real documentation.
const (
	// typeBlank is the RFC's default: no semantics beyond the status code.
	typeBlank            = "about:blank"
	typeValidationFailed = "/problems/validation-failed"
	typeMalformedBody    = "/problems/malformed-body"
)

// Problem is an RFC 7807 problem details object.
//
// Title describes the problem kind and is the same for every occurrence of a
// given Type; Detail describes this one occurrence. Neither should carry
// internal errors — those go to the log, not to the caller.
type Problem struct {
	Type          string         `json:"type"`
	Title         string         `json:"title"`
	Status        int            `json:"status"`
	Detail        string         `json:"detail,omitempty"`
	Instance      string         `json:"instance,omitempty"`
	InvalidParams []InvalidParam `json:"invalid-params,omitempty"`
}

// InvalidParam is the extension member from RFC 7807 section 3, one entry per
// field that failed validation.
type InvalidParam struct {
	Name   string `json:"name"`
	Reason string `json:"reason"`
}

// writeProblem sends an error as RFC 7807 problem details, filling in the
// defaults the RFC specifies: about:blank for an unclassified problem, and the
// status phrase as the title when the type carries no more specific one.
func writeProblem(w http.ResponseWriter, r *http.Request, problem Problem) {
	if problem.Type == "" {
		problem.Type = typeBlank
	}
	if problem.Title == "" {
		problem.Title = http.StatusText(problem.Status)
	}
	if problem.Instance == "" && r != nil {
		problem.Instance = r.URL.Path
	}

	w.Header().Set("Content-Type", problemContentType)
	w.WriteHeader(problem.Status)
	// The header is already written, so a failure here can only be logged.
	if err := json.NewEncoder(w).Encode(problem); err != nil {
		log.Error().Err(err).Msg("Failed to encode problem response")
	}
}

// serverProblem is the response for a failure the caller cannot act on. The
// cause is logged rather than returned, so the body says nothing about it.
func serverProblem(w http.ResponseWriter, r *http.Request) {
	writeProblem(w, r, Problem{
		Status: http.StatusInternalServerError,
		Detail: "Something went wrong. Please try again.",
	})
}
