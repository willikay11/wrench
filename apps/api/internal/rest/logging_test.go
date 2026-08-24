package rest

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"
	"github.com/rs/zerolog"
	"github.com/rs/zerolog/log"
)

func TestRequestLoggerCoversUnroutedRequests(t *testing.T) {
	var buf bytes.Buffer
	original := log.Logger
	log.Logger = zerolog.New(&buf)
	defer func() { log.Logger = original }()

	r := chi.NewRouter()
	r.Use(middleware.RequestID)
	r.Use(RequestLogger)
	r.Use(middleware.Recoverer)
	r.Get("/health", func(w http.ResponseWriter, _ *http.Request) { w.WriteHeader(200) })
	r.Post("/v1/waitlist", func(w http.ResponseWriter, _ *http.Request) { w.WriteHeader(201) })
	r.Get("/boom", func(http.ResponseWriter, *http.Request) { panic("kaboom") })

	cases := []struct {
		name       string
		method     string
		path       string
		wantStatus int
		wantLevel  string
	}{
		{"matched route", "GET", "/health", 200, "info"},
		{"wrong method on a known path", "POST", "/health", 405, "warn"},
		{"wrong method the other way", "GET", "/v1/waitlist", 405, "warn"},
		{"no such route", "GET", "/nope/at/all", 404, "warn"},
		{"unknown verb entirely", "PATCH", "/health", 405, "warn"},
		{"panicking handler", "GET", "/boom", 500, "error"},
	}

	for _, tc := range cases {
		buf.Reset()
		rec := httptest.NewRecorder()
		r.ServeHTTP(rec, httptest.NewRequest(tc.method, tc.path, nil))

		if buf.Len() == 0 {
			t.Fatalf("%s: nothing logged for %s %s", tc.name, tc.method, tc.path)
		}
		var e map[string]any
		if err := json.Unmarshal(buf.Bytes(), &e); err != nil {
			t.Fatalf("%s: log line is not JSON: %v", tc.name, err)
		}
		gotStatus := int(e["status"].(float64))
		if gotStatus != tc.wantStatus {
			t.Errorf("%s: logged status %d, want %d", tc.name, gotStatus, tc.wantStatus)
		}
		if e["level"] != tc.wantLevel {
			t.Errorf("%s: level %v, want %v", tc.name, e["level"], tc.wantLevel)
		}
		if e["requestId"] == "" || e["requestId"] == nil {
			t.Errorf("%s: requestId missing", tc.name)
		}
		t.Logf("%-28s %-6s %-14s -> %v %d", tc.name, tc.method, tc.path, e["level"], gotStatus)
	}
}
