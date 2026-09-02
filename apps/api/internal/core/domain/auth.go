package domain

import (
	"context"
	"errors"
	"time"

	"github.com/golang-jwt/jwt/v5"
	"github.com/google/uuid"
)

type contextKey string

// The key is unexported and so is its type: nothing outside this package needs
// it now that WithUserID and the accessors below exist, and the unexported
// type already made collisions impossible — context.Value matches on type
// identity, and no other package can name this one.
const userIDKey contextKey = "userID"

// ErrNoAuthenticatedUser is what MustUserID panics with. A typed value rather
// than a string so a recovery handler can identify it with errors.Is and
// report it as the wiring mistake it is, instead of one more opaque 500.
var ErrNoAuthenticatedUser = errors.New("domain: no authenticated user in context")

// WithUserID records the authenticated user on the request context. Only the
// authentication middleware should call it.
func WithUserID(ctx context.Context, userID uuid.UUID) context.Context {
	return context.WithValue(ctx, userIDKey, userID)
}

// UserIDFrom returns the id of the user the request authenticated as.
//
// ok is false when the authentication middleware did not run — a route mounted
// outside it, or a test that skipped it. Callers must not fall back to
// uuid.Nil on that: every owned row belongs to a real user, and a zero owner
// would either fail a foreign key or match nothing and read as "no such row".
func UserIDFrom(ctx context.Context) (uuid.UUID, bool) {
	userID, ok := ctx.Value(userIDKey).(uuid.UUID)
	return userID, ok
}

// MustUserID is UserIDFrom for handlers always mounted behind the middleware,
// where its absence is a wiring mistake rather than something the caller can
// fix. It panics with ErrNoAuthenticatedUser, which chi's Recoverer turns into
// a logged 500 — the loud failure such a mistake deserves.
func MustUserID(ctx context.Context) uuid.UUID {
	userID, ok := UserIDFrom(ctx)
	if !ok {
		panic(ErrNoAuthenticatedUser)
	}

	return userID
}

type Auth struct {
	AccessToken  string `json:"accessToken"`
	RefreshToken string `json:"refreshToken"`
	User         User   `json:"user"`
}

type User struct {
	Id            uuid.UUID `json:"id"`
	Email         string    `json:"email"`
	DisplayName   string    `json:"displayName"`
	AvatarUrl     string    `json:"avatarUrl"`
	EmailVerified bool      `json:"emailVerified"`
	Status        string    `json:"status"`
}

type UserIdentity struct {
	Id            uuid.UUID
	UserId        uuid.UUID
	Provider      string
	ProviderEmail string
}

type JWTClaims struct {
	UserID      string `json:"userId"`
	DisplayName string `json:"displayName"`
	jwt.RegisteredClaims
}

type LoggedInUser struct {
	AccessToken  string `json:"accessToken"`
	ExpiresIn    int    `json:"expiresIn"`
	RefreshToken string `json:"refreshToken"`
	User         User   `json:"user"`
}

type RefreshToken struct {
	Id        uuid.UUID
	UserId    uuid.UUID
	TokenHash string
	Family    uuid.UUID
	ExpiresAt time.Time
	RevokedAt time.Time
}

var ErrUserIdentityNotFound = errors.New("user identity not found")
var ErrUserNotFound = errors.New("user not found")
var ErrUserNotVerified = errors.New("user not verified")
var ErrUserSuspended = errors.New("user suspended")
var ErrRefreshTokenNotFound = errors.New("refresh token not found")
var ErrRefreshTokenExpired = errors.New("refresh token expired")
var ErrRefreshTokenRevoked = errors.New("refresh token revoked")

const UserStatusActive = "active"
const UserStatusSuspended = "suspended"

const UserCreated = "UserCreated"
const UserLoggedIn = "UserLoggedIn"
