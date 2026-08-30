package rest_test

import (
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/coreos/go-oidc"
	"github.com/golang-jwt/jwt/v5"
	"github.com/google/uuid"
	"github.com/stretchr/testify/require"
	"golang.org/x/oauth2"

	"github.com/willikay11/wrench/api/internal/core/domain"
	authsvc "github.com/willikay11/wrench/api/internal/core/services/auth"
	"github.com/willikay11/wrench/api/internal/rest"
)

/*
POST /v1/auth/refresh takes one field — the opaque refresh token — and derives
the user from the row that token's hash resolves to. There is no id in the
path, the body or a header for a caller to substitute, so the endpoint has no
direct object reference to tamper with in the usual sense.

What these tests cover is the property that IDOR testing is *for*: that one
user's credential can never yield another user's session, and that nothing the
caller sends can steer whose session is minted. They run the real handler over
the real service, with only the repository faked, so the authorization decision
under test is the production one.
*/

const testJWTSecret = "test-secret-at-least-32-characters-long"

// Mirrors the service's own hashing. Refresh tokens are stored as a SHA-256
// digest and looked up by it.
func hashToken(token string) string {
	sum := sha256.Sum256([]byte(token))
	return hex.EncodeToString(sum[:])
}

type createdToken struct {
	userId uuid.UUID
	hash   string
	family uuid.UUID
}

// fakeAuthRepo is the database. Only the refresh path is implemented; the
// login methods panic so a wrong turn is loud rather than silently empty.
type fakeAuthRepo struct {
	users  map[uuid.UUID]domain.User
	tokens map[string]domain.RefreshToken // keyed by token hash

	created         []createdToken
	revokedHashes   []string
	revokedFamilies []uuid.UUID
}

func (f *fakeAuthRepo) FindRefreshTokenByHash(_ context.Context, tokenHash string) (domain.RefreshToken, error) {
	token, ok := f.tokens[tokenHash]
	if !ok {
		return domain.RefreshToken{}, domain.ErrRefreshTokenNotFound
	}
	return token, nil
}

func (f *fakeAuthRepo) FindUserById(_ context.Context, id uuid.UUID) (domain.User, error) {
	user, ok := f.users[id]
	if !ok {
		return domain.User{}, domain.ErrUserNotFound
	}
	return user, nil
}

func (f *fakeAuthRepo) CreateRefreshToken(_ context.Context, userId uuid.UUID, tokenHash string, family uuid.UUID, _ time.Time) error {
	f.created = append(f.created, createdToken{userId: userId, hash: tokenHash, family: family})
	return nil
}

func (f *fakeAuthRepo) RevokeRefreshToken(_ context.Context, tokenHash string) error {
	f.revokedHashes = append(f.revokedHashes, tokenHash)
	return nil
}

func (f *fakeAuthRepo) RevokeFamily(_ context.Context, family uuid.UUID) error {
	f.revokedFamilies = append(f.revokedFamilies, family)
	return nil
}

func (f *fakeAuthRepo) UpdateLastLogin(_ context.Context, _ uuid.UUID) error { return nil }

func (f *fakeAuthRepo) FindUserIdentity(context.Context, string, string) (domain.UserIdentity, error) {
	panic("refresh must not reach the identity lookup")
}
func (f *fakeAuthRepo) FindUser(context.Context, string) (domain.User, error) {
	panic("refresh must not reach the email lookup")
}
func (f *fakeAuthRepo) CreateUser(context.Context, string, string, string, bool) (domain.User, error) {
	panic("refresh must not create a user")
}
func (f *fakeAuthRepo) CreateUserIdentity(context.Context, uuid.UUID, string, string, string) error {
	panic("refresh must not create an identity")
}
func (f *fakeAuthRepo) LinkUserIdentity(context.Context, uuid.UUID, uuid.UUID) error {
	panic("refresh must not link an identity")
}

type passthroughTx struct{}

func (passthroughTx) WithinTransaction(ctx context.Context, fn func(context.Context) error) error {
	return fn(ctx)
}

// Never called on the refresh path; present because the service requires one.
type unusedExchanger struct{}

func (unusedExchanger) Exchange(context.Context, string, ...oauth2.AuthCodeOption) (*oauth2.Token, error) {
	panic("refresh must not exchange a code with Google")
}

type fixture struct {
	repo    *fakeAuthRepo
	handler *rest.AuthHandler

	alice, bob       domain.User
	aliceFam, bobFam uuid.UUID
	aliceTok, bobTok string
}

// Two users, each signed in on their own device, each holding a live token.
func newFixture(t *testing.T) *fixture {
	t.Helper()

	alice := domain.User{
		Id: uuid.New(), Email: "alice@example.com", DisplayName: "Alice",
		AvatarUrl: "https://example.com/alice.png", Status: domain.UserStatusActive,
	}
	bob := domain.User{
		Id: uuid.New(), Email: "bob@example.com", DisplayName: "Bob",
		AvatarUrl: "https://example.com/bob.png", Status: domain.UserStatusActive,
	}

	aliceFam, bobFam := uuid.New(), uuid.New()
	aliceTok, bobTok := "alice-refresh-token", "bob-refresh-token"

	repo := &fakeAuthRepo{
		users: map[uuid.UUID]domain.User{alice.Id: alice, bob.Id: bob},
		tokens: map[string]domain.RefreshToken{
			hashToken(aliceTok): {
				Id: uuid.New(), UserId: alice.Id, TokenHash: hashToken(aliceTok),
				Family: aliceFam, ExpiresAt: time.Now().Add(24 * time.Hour),
			},
			hashToken(bobTok): {
				Id: uuid.New(), UserId: bob.Id, TokenHash: hashToken(bobTok),
				Family: bobFam, ExpiresAt: time.Now().Add(24 * time.Hour),
			},
		},
	}

	service := authsvc.NewService(
		unusedExchanger{},
		oidc.NewVerifier("https://accounts.google.com", nil, &oidc.Config{ClientID: "unused"}),
		repo,
		passthroughTx{},
		testJWTSecret,
	)

	return &fixture{
		repo: repo, handler: rest.NewAuthHandler(service),
		alice: alice, bob: bob,
		aliceFam: aliceFam, bobFam: bobFam,
		aliceTok: aliceTok, bobTok: bobTok,
	}
}

// refresh drives the real HTTP handler, so anything the body carries reaches
// the endpoint exactly as an attacker would send it.
func (f *fixture) refresh(t *testing.T, body any) (*httptest.ResponseRecorder, domain.LoggedInUser) {
	t.Helper()

	encoded, err := json.Marshal(body)
	require.NoError(t, err)

	request := httptest.NewRequest(http.MethodPost, "/v1/auth/refresh", bytes.NewReader(encoded))
	request.Header.Set("Content-Type", "application/json")

	recorder := httptest.NewRecorder()
	f.handler.RefreshToken(recorder, request)

	var session domain.LoggedInUser
	_ = json.Unmarshal(recorder.Body.Bytes(), &session)

	return recorder, session
}

// claimedUserID reads the subject the access token actually grants, which is
// what downstream requests will be authorised as.
func claimedUserID(t *testing.T, accessToken string) string {
	t.Helper()

	var claims domain.JWTClaims
	_, err := jwt.ParseWithClaims(accessToken, &claims, func(*jwt.Token) (any, error) {
		return []byte(testJWTSecret), nil
	})
	require.NoError(t, err)

	return claims.UserID
}

func TestRefreshTokenIsScopedToItsOwner(t *testing.T) {
	f := newFixture(t)

	recorder, session := f.refresh(t, map[string]string{"refreshToken": f.aliceTok})

	require.Equal(t, http.StatusOK, recorder.Code)
	require.Equal(t, f.alice.Id, session.User.Id)
	require.Equal(t, f.alice.Email, session.User.Email)
	// The access token is the part that actually carries authority.
	require.Equal(t, f.alice.Id.String(), claimedUserID(t, session.AccessToken))

	// Nothing of Bob's leaks into a response minted from Alice's token.
	require.NotContains(t, recorder.Body.String(), f.bob.Id.String())
	require.NotContains(t, recorder.Body.String(), f.bob.Email)
}

// The IDOR probe proper. There is no id parameter to substitute, so the attempt
// is to smuggle one in the body and see whether anything downstream reads it.
func TestRefreshIgnoresCallerSuppliedIdentifiers(t *testing.T) {
	f := newFixture(t)

	recorder, session := f.refresh(t, map[string]any{
		"refreshToken": f.aliceTok,
		// Every shape the service or its JSON decoding might plausibly honour.
		"userId": f.bob.Id.String(),
		"id":     f.bob.Id.String(),
		"sub":    f.bob.Id.String(),
		"email":  f.bob.Email,
		"user":   map[string]string{"id": f.bob.Id.String(), "email": f.bob.Email},
	})

	require.Equal(t, http.StatusOK, recorder.Code)
	// The session belongs to the token's owner, not to the id in the body.
	require.Equal(t, f.alice.Id, session.User.Id)
	require.Equal(t, f.alice.Id.String(), claimedUserID(t, session.AccessToken))

	// And the rotation was written against Alice, not Bob.
	require.Len(t, f.repo.created, 1)
	require.Equal(t, f.alice.Id, f.repo.created[0].userId)
}

func TestRefreshRotatesWithinTheOwnersFamilyOnly(t *testing.T) {
	f := newFixture(t)

	_, session := f.refresh(t, map[string]string{"refreshToken": f.aliceTok})

	require.Len(t, f.repo.created, 1)
	require.Equal(t, f.alice.Id, f.repo.created[0].userId)
	// Same family: the chain continues rather than starting a new one.
	require.Equal(t, f.aliceFam, f.repo.created[0].family)
	require.NotEqual(t, f.bobFam, f.repo.created[0].family)

	// The presented token is spent, and only it.
	require.Equal(t, []string{hashToken(f.aliceTok)}, f.repo.revokedHashes)
	require.NotContains(t, f.repo.revokedHashes, hashToken(f.bobTok))

	// The new token is not the one just handed back in plaintext.
	require.NotEqual(t, hashToken(f.aliceTok), f.repo.created[0].hash)
	require.NotEmpty(t, session.RefreshToken)
	require.NotEqual(t, f.aliceTok, session.RefreshToken)
}

// Reuse means a token was stolen. Burning the family logs out that one login,
// and must not touch the other user — that is the whole reason it is not
// "revoke everything belonging to this user".
func TestReuseBurnsOnlyThePresentingFamily(t *testing.T) {
	f := newFixture(t)

	revoked := f.repo.tokens[hashToken(f.aliceTok)]
	revoked.RevokedAt = time.Now().Add(-time.Hour)
	f.repo.tokens[hashToken(f.aliceTok)] = revoked

	recorder, _ := f.refresh(t, map[string]string{"refreshToken": f.aliceTok})

	require.Equal(t, http.StatusUnauthorized, recorder.Code)
	require.Equal(t, []uuid.UUID{f.aliceFam}, f.repo.revokedFamilies)
	require.NotContains(t, f.repo.revokedFamilies, f.bobFam)
	// No session is issued to a replayed token.
	require.Empty(t, f.repo.created)

	// Bob, on his own family, is unaffected.
	bobRecorder, bobSession := f.refresh(t, map[string]string{"refreshToken": f.bobTok})
	require.Equal(t, http.StatusOK, bobRecorder.Code)
	require.Equal(t, f.bob.Id, bobSession.User.Id)
}

func TestRefreshRejectsTokensThatGrantNothing(t *testing.T) {
	cases := []struct {
		name  string
		setup func(f *fixture) any
	}{
		{
			name:  "a token nobody holds",
			setup: func(*fixture) any { return map[string]string{"refreshToken": "not-a-token"} },
		},
		{
			name:  "an empty token",
			setup: func(*fixture) any { return map[string]string{"refreshToken": ""} },
		},
		{
			// The hash is the lookup key, so presenting it is presenting the
			// database's copy rather than the secret it stands for.
			name: "the stored hash instead of the token",
			setup: func(f *fixture) any {
				return map[string]string{"refreshToken": hashToken(f.aliceTok)}
			},
		},
		{
			name: "an expired token",
			setup: func(f *fixture) any {
				expired := f.repo.tokens[hashToken(f.aliceTok)]
				expired.ExpiresAt = time.Now().Add(-time.Minute)
				f.repo.tokens[hashToken(f.aliceTok)] = expired
				return map[string]string{"refreshToken": f.aliceTok}
			},
		},
		{
			name: "a valid token whose owner is suspended",
			setup: func(f *fixture) any {
				suspended := f.alice
				suspended.Status = domain.UserStatusSuspended
				f.repo.users[f.alice.Id] = suspended
				return map[string]string{"refreshToken": f.aliceTok}
			},
		},
	}

	var bodies []string

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			f := newFixture(t)

			recorder, session := f.refresh(t, tc.setup(f))

			require.Equal(t, http.StatusUnauthorized, recorder.Code)
			require.Empty(t, session.AccessToken)
			require.Empty(t, session.RefreshToken)
			require.Equal(t, uuid.Nil, session.User.Id)
			// Nothing was issued on the way to refusing.
			require.Empty(t, f.repo.created)

			bodies = append(bodies, recorder.Body.String())
		})
	}

	// Identical refusals: a body that differs between "expired" and "no such
	// token" tells an attacker which guesses were once real tokens.
	for _, body := range bodies {
		require.Equal(t, bodies[0], body)
	}
}
