package rest

import (
	"encoding/json"
	"fmt"
	"net/http"

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
		payload := map[string]string{"error": "Invalid request payload"}
		writeJSON(w, http.StatusBadRequest, payload)
		return
	}

	loggedInUser, userMessage, err := h.authService.LoginWithGoogle(r.Context(), request.Code, request.Verifier)

	if err != nil {
		fmt.Println(err.Error())
		payload := map[string]string{"error": "Something went wrong"}
		writeJSON(w, http.StatusInternalServerError, payload)
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
		payload := map[string]string{"error": "Invalid request payload"}
		writeJSON(w, http.StatusBadRequest, payload)
		return
	}

	loggedInUser, err := h.authService.RefreshToken(r.Context(), request.RefreshToken)

	if err != nil {
		payload := map[string]string{"message": "Unauthorized"}
		writeJSON(w, http.StatusUnauthorized, payload)
		return
	}

	writeJSON(w, http.StatusOK, loggedInUser)
}

func (h *AuthHandler) Logout(w http.ResponseWriter, r *http.Request) {
	var request struct {
		RefreshToken string `json:"refreshToken"`
	}

	body := http.MaxBytesReader(w, r.Body, 1048576) // Limit request body to 1MB

	decodeErr := json.NewDecoder(body).Decode(&request)

	if decodeErr != nil {
		payload := map[string]string{"error": "Invalid request payload"}
		writeJSON(w, http.StatusBadRequest, payload)
		return
	}

	err := h.authService.Logout(r.Context(), request.RefreshToken)

	if err != nil {
		payload := map[string]string{"message": "Unauthorized"}
		writeJSON(w, http.StatusUnauthorized, payload)
		return
	}

	writeJSON(w, http.StatusOK, nil)
}
