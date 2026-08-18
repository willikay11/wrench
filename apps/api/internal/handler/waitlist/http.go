package waitlist

import (
	"encoding/json"
	"errors"
	"net/http"

	"github.com/rs/zerolog/log"
	"github.com/willikay11/wrench/api/internal/core/domain"
	"github.com/willikay11/wrench/api/internal/core/ports"
)

type HTTPHandler struct {
	waitlistService ports.WaitlistService
}

func NewHTTPHandler(waitlistService ports.WaitlistService) *HTTPHandler {
	return &HTTPHandler{
		waitlistService: waitlistService,
	}
}

func (h *HTTPHandler) JoinWaitlist(w http.ResponseWriter, r *http.Request) {
	var request struct {
		Email string `json:"email"`
	}

	body := http.MaxBytesReader(w, r.Body, 1048576) // Limit request body to 1MB

	decodeErr := json.NewDecoder(body).Decode(&request)

	if decodeErr != nil {
		payload := map[string]string{"error": "Invalid request payload"}
		writeJSON(w, http.StatusBadRequest, payload)
		return
	}

	waitlist, err := h.waitlistService.JoinWaitlist(request.Email)

	if err != nil {
		if errors.Is(err, domain.ErrInvalidEmail) {
			payload := map[string]string{"error": "Invalid email"}
			writeJSON(w, http.StatusBadRequest, payload)
			return
		}
		log.Error().Err(err).Str("email", request.Email).Msg("Failed to join waitlist")
		payload := map[string]string{"error": "Something went wrong"}
		writeJSON(w, http.StatusInternalServerError, payload)
		return
	}

	writeJSON(w, http.StatusCreated, map[string]string{"email": waitlist.Email})
}

func writeJSON(w http.ResponseWriter, status int, payload any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(payload)
}
