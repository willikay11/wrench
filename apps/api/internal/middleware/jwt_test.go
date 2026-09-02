package CustomMiddleware_test

import (
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/golang-jwt/jwt/v5"
	"github.com/google/uuid"
	"github.com/stretchr/testify/require"

	"github.com/willikay11/wrench/api/internal/core/domain"
	CustomMiddleware "github.com/willikay11/wrench/api/internal/middleware"
)

const testSecret = "test-secret-at-least-32-characters-long"

func signedFor(t *testing.T, subject string, secret string) string {
	t.Helper()

	signed, err := jwt.NewWithClaims(jwt.SigningMethodHS256, domain.JWTClaims{
		UserID:      subject,
		DisplayName: "Someone",
		RegisteredClaims: jwt.RegisteredClaims{
			ExpiresAt: jwt.NewNumericDate(time.Now().Add(15 * time.Minute)),
			IssuedAt:  jwt.NewNumericDate(time.Now()),
			Issuer:    "wrench",
		},
	}).SignedString([]byte(secret))
	require.NoError(t, err)

	return signed
}

// serve runs the middleware over a handler that records what the accessor
// returned, so the assertions are on what a real handler would actually see.
func serve(t *testing.T, header string) (*httptest.ResponseRecorder, uuid.UUID, bool) {
	t.Helper()

	var (
		seen    uuid.UUID
		present bool
		reached bool
	)

	next := http.HandlerFunc(func(_ http.ResponseWriter, r *http.Request) {
		reached = true
		seen, present = domain.UserIDFrom(r.Context())
	})

	request := httptest.NewRequest(http.MethodGet, "/v1/cars", nil)
	if header != "" {
		request.Header.Set("Authorization", header)
	}

	recorder := httptest.NewRecorder()
	CustomMiddleware.AuthenticateJWT(testSecret)(next).ServeHTTP(recorder, request)

	if !reached {
		return recorder, uuid.Nil, false
	}

	return recorder, seen, present
}

func TestUserIDReachesTheHandlerAsAUUID(t *testing.T) {
	subject := uuid.New()

	recorder, seen, present := serve(t, "Bearer "+signedFor(t, subject.String(), testSecret))

	require.Equal(t, http.StatusOK, recorder.Code)
	require.True(t, present)
	require.Equal(t, subject, seen)
}

// The point of the typed accessor: a handler cannot mistake "nobody
// authenticated" for a real user, because there is no value to read.
func TestUnauthenticatedRequestsNeverReachTheHandler(t *testing.T) {
	valid := signedFor(t, uuid.NewString(), testSecret)

	cases := map[string]string{
		"no header":            "",
		"bearer with no token": "Bearer ",
		"not a jwt":            "Bearer not-a-jwt",
		"signed with another secret": "Bearer " +
			signedFor(t, uuid.NewString(), "a-different-secret-at-least-32-chars"),
		// A scheme is required. Honouring a bare token would widen the
		// contract to a header shape no client should be sending.
		"no scheme at all": valid,
		"the wrong scheme": "Basic " + valid,
	}

	for name, header := range cases {
		t.Run(name, func(t *testing.T) {
			_, seen, present := serve(t, header)

			require.False(t, present)
			require.Equal(t, uuid.Nil, seen)
		})
	}
}

// A subject that is not a UUID is a token we did not mint. Rejecting it here
// keeps every handler from having to parse, and from having to decide what to
// do when parsing fails.
func TestSubjectThatIsNotAUUIDIsRejected(t *testing.T) {
	_, seen, present := serve(t, "Bearer "+signedFor(t, "not-a-uuid", testSecret))

	require.False(t, present)
	require.Equal(t, uuid.Nil, seen)
}

func TestUserIDFromReportsAbsenceRatherThanZero(t *testing.T) {
	userID, ok := domain.UserIDFrom(t.Context())

	require.False(t, ok)
	require.Equal(t, uuid.Nil, userID)
}

// A route mounted outside the middleware is a wiring mistake. It should be
// loud, not a request silently attributed to the zero user.
func TestMustUserIDPanicsWithoutTheMiddleware(t *testing.T) {
	require.Panics(t, func() { domain.MustUserID(t.Context()) })
}

func TestMustUserIDReturnsTheAuthenticatedUser(t *testing.T) {
	subject := uuid.New()

	var seen uuid.UUID
	next := http.HandlerFunc(func(_ http.ResponseWriter, r *http.Request) {
		seen = domain.MustUserID(r.Context())
	})

	request := httptest.NewRequest(http.MethodGet, "/v1/cars", nil)
	request.Header.Set("Authorization", "Bearer "+signedFor(t, subject.String(), testSecret))

	CustomMiddleware.AuthenticateJWT(testSecret)(next).ServeHTTP(httptest.NewRecorder(), request)

	require.Equal(t, subject, seen)
}

// RFC 7235: the auth-scheme is case-insensitive, so a client sending `bearer`
// is not doing anything wrong and must not be turned away.
func TestBearerSchemeIsCaseInsensitive(t *testing.T) {
	subject := uuid.New()
	token := signedFor(t, subject.String(), testSecret)

	for _, scheme := range []string{"Bearer", "bearer", "BEARER", "BeArEr"} {
		t.Run(scheme, func(t *testing.T) {
			recorder, seen, present := serve(t, scheme+" "+token)

			require.Equal(t, http.StatusOK, recorder.Code)
			require.True(t, present)
			require.Equal(t, subject, seen)
		})
	}
}

// Extra whitespace between the scheme and the credentials is not the client
// being malicious, and the token still parses once it is trimmed.
func TestExtraWhitespaceAroundTheTokenIsTolerated(t *testing.T) {
	subject := uuid.New()

	_, seen, present := serve(t, "Bearer   "+signedFor(t, subject.String(), testSecret)+"  ")

	require.True(t, present)
	require.Equal(t, subject, seen)
}

// A typed panic value lets a recovery handler tell a wiring mistake apart from
// any other 500, rather than matching on a string.
func TestMustUserIDPanicsWithATypedError(t *testing.T) {
	defer func() {
		recovered := recover()
		require.NotNil(t, recovered)

		err, ok := recovered.(error)
		require.True(t, ok, "panicked with %T, not an error", recovered)
		require.ErrorIs(t, err, domain.ErrNoAuthenticatedUser)
	}()

	domain.MustUserID(t.Context())
}
