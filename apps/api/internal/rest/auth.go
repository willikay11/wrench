package rest

import (
	"encoding/json"
	"net/http"

	"github.com/rs/zerolog/log"
	"github.com/willikay11/wrench/api/internal/core/domain"
	"github.com/willikay11/wrench/api/internal/core/ports"
)

type AuthHandler struct {
	authService ports.AuthService
}

func NewAuthHandler(authService ports.AuthService) *AuthHandler {
	return &AuthHandler{
		authService: authService,
	}
}

func (h *AuthHandler) LoginWithGoogle(w http.ResponseWriter, r *http.Request) {
	var request struct {
		Code     string `json:"code"`
		Verifier string `json:"verifier"`
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

	loggedInUser, userMessage, err := h.authService.LoginWithGoogle(r.Context(), request.Code, request.Verifier)

	if err != nil {
		log.Error().Err(err).Msg("Failed to log in with Google")
		serverProblem(w, r)
		return
	}

	var statusCode int
	if userMessage == domain.UserCreated {
		statusCode = http.StatusCreated
	} else {
		statusCode = http.StatusOK
	}

	writeJSON(w, statusCode, loggedInUser)

}

func (h *AuthHandler) RefreshToken(w http.ResponseWriter, r *http.Request) {
	var request struct {
		RefreshToken string `json:"refreshToken"`
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

	loggedInUser, err := h.authService.RefreshToken(r.Context(), request.RefreshToken)

	if err != nil {
		writeProblem(w, r, Problem{
			Status: http.StatusUnauthorized,
			Detail: "The refresh token is missing, expired, or already used.",
		})
		return
	}

	writeJSON(w, http.StatusOK, loggedInUser)

}
