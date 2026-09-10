package ports

import (
	"context"
	"time"

	"github.com/google/uuid"
	"golang.org/x/oauth2"

	"github.com/willikay11/wrench/api/internal/core/domain"
)

// Driving — the HTTP handler calls in through this.
type AuthService interface {
	LoginWithGoogle(ctx context.Context, idToken string, verifier string) (domain.LoggedInUser, string, error)
	RefreshToken(ctx context.Context, refreshToken string) (domain.LoggedInUser, error)
}

// Driven — the authorization code exchange with Google.
//
// An interface rather than *oauth2.Config because the concrete struct reaches
// the network, so nothing can stand in for it in a test. *oauth2.Config
// satisfies this as it is; Exchange has a pointer receiver.
type GoogleTokenExchanger interface {
	Exchange(ctx context.Context, code string, opts ...oauth2.AuthCodeOption) (*oauth2.Token, error)
}

// Driven - core calls out through this.
type AuthRepository interface {
	FindUserIdentity(ctx context.Context, providerUserId string, provider string) (domain.UserIdentity, error)
	FindUser(ctx context.Context, email string) (domain.User, error)
	FindUserById(ctx context.Context, id uuid.UUID) (domain.User, error)
	CreateUser(ctx context.Context, email string, displayName string, avatarUrl string, emailVerified bool) (domain.User, error)
	CreateUserIdentity(ctx context.Context, userId uuid.UUID, provider string, providerEmail string, providerUserId string) error
	LinkUserIdentity(ctx context.Context, userId uuid.UUID, userIdentityId uuid.UUID) error
	UpdateLastLogin(ctx context.Context, id uuid.UUID) error
	CreateRefreshToken(ctx context.Context, userId uuid.UUID, tokenHash string, family uuid.UUID, expiresAt time.Time) error
	FindRefreshTokenByHash(ctx context.Context, tokenHash string) (domain.RefreshToken, error)
	RevokeRefreshToken(ctx context.Context, tokenHash string) error
	RevokeFamily(ctx context.Context, family uuid.UUID) error
}
