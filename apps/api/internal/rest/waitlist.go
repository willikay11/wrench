package rest

import (
	"encoding/json"
	"errors"
	"net/http"

	"github.com/rs/zerolog/log"
	"github.com/willikay11/wrench/api/internal/core/domain"
	"github.com/willikay11/wrench/api/internal/core/ports"
)

type WaitlistHandler struct {
	waitlistService ports.WaitlistService
}

func NewWaitlistHandler(waitlistService ports.WaitlistService) *WaitlistHandler {
	return &WaitlistHandler{
		waitlistService: waitlistService,
	}
}

func (h *WaitlistHandler) JoinWaitlist(w http.ResponseWriter, r *http.Request) {
	var request struct {
		Email string `json:"email"`
	}

	body := http.MaxBytesReader(w, r.Body, 1048576) // Limit request body to 1MB

	decodeErr := json.NewDecoder(body).Decode(&request)

	if decodeErr != nil {
		writeProblem(w, r, Problem{
			Type:   typeMalformedBody,
			Title:  "The request body could not be read",
			Status: http.StatusBadRequest,
		})
		return
	}

	waitlist, err := h.waitlistService.JoinWaitlist(r.Context(), request.Email)

	if err != nil {
		if errors.Is(err, domain.ErrInvalidEmail) {
			writeProblem(w, r, Problem{
				Type:  typeValidationFailed,
				Title: "The waitlist details did not validate",
				// 400, not 422: the web client already branches on it.
				Status:        http.StatusBadRequest,
				InvalidParams: []InvalidParam{{Name: "email", Reason: "This is not a valid email address"}},
			})
			return
		}
		log.Error().Err(err).Msg("Failed to join waitlist")
		serverProblem(w, r)
		return
	}

	writeJSON(w, http.StatusCreated, map[string]string{"email": waitlist.Email})
}

func (h *WaitlistHandler) CountWaitlist(w http.ResponseWriter, r *http.Request) {
	count, err := h.waitlistService.CountWaitlist(r.Context())

	if err != nil {
		log.Error().Err(err).Msg("Failed to count waitlist")
		serverProblem(w, r)
		return
	}
	writeJSON(w, http.StatusOK, map[string]int{"count": count})
}

func writeJSON(w http.ResponseWriter, status int, payload any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	// The header is already written, so a failure here can only be logged.
	if err := json.NewEncoder(w).Encode(payload); err != nil {
		log.Error().Err(err).Msg("Failed to encode JSON response")
	}
}
