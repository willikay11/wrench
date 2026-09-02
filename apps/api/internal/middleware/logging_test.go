package CustomMiddleware_test

import (
	"bytes"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"strings"
	"testing"
	"time"

	"github.com/golang-jwt/jwt/v5"
	"github.com/google/uuid"
	"github.com/rs/zerolog"
	zlog "github.com/rs/zerolog/log"
	"github.com/stretchr/testify/require"

	"github.com/willikay11/wrench/api/internal/core/domain"
	CustomMiddleware "github.com/willikay11/wrench/api/internal/middleware"
)

// captureOutput collects everything the middleware writes anywhere a log line
// could land: zerolog's global logger, plus raw stdout and stderr, so a
// reintroduced fmt.Println is caught as readily as a structured field.
func captureOutput(t *testing.T, run func()) string {
	t.Helper()

	var structured bytes.Buffer

	originalLogger := zlog.Logger
	zlog.Logger = zerolog.New(&structured)
	defer func() { zlog.Logger = originalLogger }()

	originalStdout, originalStderr := os.Stdout, os.Stderr

	reader, writer, err := os.Pipe()
	require.NoError(t, err)

	os.Stdout, os.Stderr = writer, writer

	done := make(chan string)
	go func() {
		var printed bytes.Buffer
		_, _ = io.Copy(&printed, reader)
		done <- printed.String()
	}()

	run()

	_ = writer.Close()
	os.Stdout, os.Stderr = originalStdout, originalStderr

	return structured.String() + <-done
}

// A token whose every field is recognisable, so anything that leaks is
// unambiguous in the assertion below.
func revealingToken(t *testing.T, secret string) (raw string, subject string) {
	t.Helper()

	subject = uuid.New().String()

	raw, err := jwt.NewWithClaims(jwt.SigningMethodHS256, domain.JWTClaims{
		UserID:      subject,
		DisplayName: "leaky.person@example.com",
		RegisteredClaims: jwt.RegisteredClaims{
			ExpiresAt: jwt.NewNumericDate(time.Now().Add(15 * time.Minute)),
			IssuedAt:  jwt.NewNumericDate(time.Now()),
			Issuer:    "wrench",
		},
	}).SignedString([]byte(secret))
	require.NoError(t, err)

	return raw, subject
}

// standards.logging in .mentor.config.json: never log PII, and a bearer token
// is worse than PII — a log line carrying one is a session anybody with log
// access can assume.
func TestMiddlewareNeverLogsTheTokenOrItsClaims(t *testing.T) {
	valid, _ := revealingToken(t, testSecret)
	foreign, _ := revealingToken(t, "a-different-secret-at-least-32-chars")

	expired, err := jwt.NewWithClaims(jwt.SigningMethodHS256, domain.JWTClaims{
		UserID:           uuid.NewString(),
		DisplayName:      "leaky.person@example.com",
		RegisteredClaims: jwt.RegisteredClaims{ExpiresAt: jwt.NewNumericDate(time.Now().Add(-time.Hour))},
	}).SignedString([]byte(testSecret))
	require.NoError(t, err)

	unsigned, err := jwt.NewWithClaims(jwt.SigningMethodNone, domain.JWTClaims{
		UserID: uuid.NewString(),
	}).SignedString(jwt.UnsafeAllowNoneSignatureType)
	require.NoError(t, err)

	notAUUID, err := jwt.NewWithClaims(jwt.SigningMethodHS256, domain.JWTClaims{
		UserID:           "definitely-not-a-uuid",
		RegisteredClaims: jwt.RegisteredClaims{ExpiresAt: jwt.NewNumericDate(time.Now().Add(time.Hour))},
	}).SignedString([]byte(testSecret))
	require.NoError(t, err)

	headers := map[string]string{
		"valid token":      "Bearer " + valid,
		"foreign secret":   "Bearer " + foreign,
		"expired":          "Bearer " + expired,
		"alg none":         "Bearer " + unsigned,
		"subject not uuid": "Bearer " + notAUUID,
		"malformed":        "Bearer not-a-jwt",
		"no bearer prefix": valid,
		"empty":            "",
	}

	for name, header := range headers {
		t.Run(name, func(t *testing.T) {
			output := captureOutput(t, func() {
				next := http.HandlerFunc(func(http.ResponseWriter, *http.Request) {})

				request := httptest.NewRequest(http.MethodGet, "/v1/cars", nil)
				if header != "" {
					request.Header.Set("Authorization", header)
				}

				CustomMiddleware.AuthenticateJWT(testSecret)(next).
					ServeHTTP(httptest.NewRecorder(), request)
			})

			for label, secret := range map[string]string{
				"the raw token":   valid,
				"a foreign token": foreign,
				"the email claim": "leaky.person@example.com",
			} {
				require.NotContains(t, output, secret, "%s appeared in log output", label)
			}

			// Signature segments are the part that makes a leaked token usable.
			for _, token := range []string{valid, foreign, expired} {
				signature := token[strings.LastIndex(token, ".")+1:]
				require.NotContains(t, output, signature)
			}
		})
	}
}
