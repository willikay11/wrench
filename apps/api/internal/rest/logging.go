package rest

import (
	"net/http"
	"time"

	"github.com/go-chi/chi/v5/middleware"
	"github.com/rs/zerolog/log"
)

// RequestLogger logs every request that reaches the server, including ones
// that match no route (404) and ones that hit a known path with the wrong
// method (405). chi runs the middleware chain before routing, so its
// NotFound and MethodNotAllowed handlers are still wrapped by this.
//
// Register it after middleware.RequestID (so the id is in the context) and
// before middleware.Recoverer (so a panic is logged as the 500 it becomes
// rather than vanishing).
func RequestLogger(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		start := time.Now()

		// Wrap so the status and byte count are readable after the handler
		// has run — net/http gives no way to read them back otherwise.
		ww := middleware.NewWrapResponseWriter(w, r.ProtoMajor)

		defer func() {
			status := ww.Status()
			if status == 0 {
				// Handler returned without writing anything; net/http will
				// have sent 200.
				status = http.StatusOK
			}

			event := log.Info()
			switch {
			case status >= 500:
				event = log.Error()
			case status >= 400:
				event = log.Warn()
			}

			event.
				Str("method", r.Method).
				Str("path", r.URL.Path).
				Int("status", status).
				Int("bytes", ww.BytesWritten()).
				Dur("duration", time.Since(start)).
				Str("proto", r.Proto).
				Str("remoteAddr", r.RemoteAddr).
				// Untrusted and client-settable — for correlating requests
				// through Kong only, never for authorisation or rate limits.
				Str("forwardedFor", r.Header.Get("X-Forwarded-For")).
				Str("userAgent", r.UserAgent()).
				Str("requestId", middleware.GetReqID(r.Context())).
				Msg("http request")
		}()

		next.ServeHTTP(ww, r)
	})
}
