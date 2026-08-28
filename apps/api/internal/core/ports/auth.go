package ports

import (
	"context"
	"time"

	"github.com/google/uuid"
	"github.com/willikay11/wrench/api/internal/core/domain"
)

// Driving — the HTTP handler calls in through this.
type AuthService interface {
	LoginWithGoogle(ctx context.Context, idToken string, verifier string) (domain.LoggedInUser, string, error)
}

// Driven - core calls out through this.
type AuthRepository interface {
	FindUserIdentity(ctx context.Context, providerUserId string, provider string) (domain.UserIdentity, error)
	FindUser(ctx context.Context, email string) (domain.User, error)
	CreateUser(ctx context.Context, email string, displayName string, avatarUrl string, emailVerified bool) (domain.User, error)
	CreateUserIdentity(ctx context.Context, userId uuid.UUID, provider string, providerEmail string, providerUserId string) error
	LinkUserIdentity(ctx context.Context, userId uuid.UUID, userIdentityId uuid.UUID) error
	UpdateLastLogin(ctx context.Context, id uuid.UUID) error
	CreateRefreshToken(ctx context.Context, userId uuid.UUID, tokenHash string, family uuid.UUID, expiresAt time.Time) error
}
