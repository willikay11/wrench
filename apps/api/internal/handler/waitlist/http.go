package waitlist

import (
	"net/http"

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
	email := r.FormValue("email")
	waitlist, err := h.waitlistService.JoinWaitlist(email)

	if err != nil {
		w.Header().Set("Content-Type", "application/json")
		w.Write([]byte(`{"error":"` + err.Error() + `"}`))
		w.WriteHeader(http.StatusBadRequest)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.Write([]byte(`{"email":"` + waitlist.Email + `"}`))
	w.WriteHeader(http.StatusOK)
}
