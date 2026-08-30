package auth_test

import (
	"context"
	"crypto/rand"
	"crypto/rsa"
	"testing"
	"time"

	"github.com/coreos/go-oidc"
	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"golang.org/x/oauth2"

	"github.com/willikay11/wrench/api/internal/core/domain"
	"github.com/willikay11/wrench/api/internal/core/services/auth"
	authsvc "github.com/willikay11/wrench/api/internal/core/services/auth"
)

// mockOauth2Config stands in for the authorization code exchange with Google —
// the one dependency of the service that reaches the network.
//
// It mirrors ports.GoogleTokenExchanger rather than oauth2.Config: the service
// only ever calls Exchange, so the client id, endpoint and auth style the real
// struct carries are of no interest here.
type mockOauth2Config struct {
	// Returned as the `id_token` extra, where the service reads it. Left empty
	// to exercise the branch where Google answers without one.
	idToken string
	// Returned instead of a token, for the exchange-failed path.
	err error

	// What the service asked for, for tests that assert on it.
	calls      int
	calledWith string
}

func (m *mockOauth2Config) Exchange(
	_ context.Context,
	code string,
	_ ...oauth2.AuthCodeOption,
) (*oauth2.Token, error) {
	m.calls++
	m.calledWith = code

	if m.err != nil {
		return nil, m.err
	}

	token := &oauth2.Token{AccessToken: "google-access-token", TokenType: "Bearer"}

	if m.idToken == "" {
		return token, nil
	}

	return token.WithExtra(map[string]any{"id_token": m.idToken}), nil
}

type mockTxManager struct{}

func (m *mockTxManager) WithinTransaction(ctx context.Context, fn func(ctx context.Context) error) error {
	return fn(ctx)
}

type mockAuthRepository struct {
	savedUser         domain.User
	savedUserIdentity domain.UserIdentity
	savedRefreshToken domain.RefreshToken
	err               error
}

func (m *mockAuthRepository) FindUserIdentity(ctx context.Context, providerUserId string, provider string) (domain.UserIdentity, error) {
	if m.err != nil {
		return domain.UserIdentity{}, m.err
	}
	return m.savedUserIdentity, nil
}

func (m *mockAuthRepository) FindUser(ctx context.Context, email string) (domain.User, error) {
	if m.err != nil {
		return domain.User{}, m.err
	}
	return m.savedUser, nil
}

func (m *mockAuthRepository) FindUserById(ctx context.Context, id uuid.UUID) (domain.User, error) {
	if m.err != nil {
		return domain.User{}, m.err
	}
	return m.savedUser, nil
}

func (m *mockAuthRepository) CreateUser(ctx context.Context, email string, displayName string, avatarUrl string, emailVerified bool) (domain.User, error) {
	if m.err != nil {
		return domain.User{}, m.err
	}
	return m.savedUser, nil
}

func (m *mockAuthRepository) CreateUserIdentity(ctx context.Context, userId uuid.UUID, provider string, providerEmail string, providerUserId string) error {
	if m.err != nil {
		return m.err
	}
	return nil
}

func (m *mockAuthRepository) LinkUserIdentity(ctx context.Context, userId uuid.UUID, userIdentityId uuid.UUID) error {
	if m.err != nil {
		return m.err
	}
	return nil
}

func (m *mockAuthRepository) UpdateLastLogin(ctx context.Context, id uuid.UUID) error {
	if m.err != nil {
		return m.err
	}
	return nil
}

func (m *mockAuthRepository) CreateRefreshToken(ctx context.Context, userId uuid.UUID, tokenHash string, family uuid.UUID, expiresAt time.Time) error {
	if m.err != nil {
		return m.err
	}
	return nil
}

func (m *mockAuthRepository) FindRefreshTokenByHash(ctx context.Context, tokenHash string) (domain.RefreshToken, error) {
	if m.err != nil {
		return domain.RefreshToken{}, m.err
	}
	return m.savedRefreshToken, nil
}

func (m *mockAuthRepository) RevokeFamily(ctx context.Context, family uuid.UUID) error {
	if m.err != nil {
		return m.err
	}
	return nil
}

func (m *mockAuthRepository) RevokeRefreshToken(ctx context.Context, tokenHash string) error {
	if m.err != nil {
		return m.err
	}
	return nil
}

func TestRefreshToken(t *testing.T) {
	type testCase struct {
		name                 string
		token                string
		expectedLoggedInUser domain.LoggedInUser
		wantErr              error
	}
	key, err := rsa.GenerateKey(rand.Reader, 2048)
	require.NoError(t, err)

	verifier := oidc.NewVerifier(
		authsvc.GoogleIssuer,
		testKeySet{&key.PublicKey},
		authsvc.GoogleOIDCConfig(ourClientID),
	)

	var id = uuid.New()
	var family = uuid.New()

	loggedInUser := domain.LoggedInUser{
		AccessToken:  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiJkNDEwNDY1My1hN2M4LTRhNjctOTM4ZS1iYzgzNmUxM2FlZjkiLCJkaXNwbGF5TmFtZSI6IldpbGxpYW0gS2FtdXl1IiwiaXNzIjoid3JlbmNoIiwiZXhwIjoxNzg3OTE2OTQ2LCJuYmYiOjE3ODc5MTYwNDYsImlhdCI6MTc4NzkxNjA0Nn0.NwSu7cEow1RIw2sOt8aKz-xCs9hhGQywKNM6oWLqk5g",
		RefreshToken: "k6YQl3nT18GUH3dXl_yvKcetwObqegKplMQqKeqoycA",
		ExpiresIn:    900,
		User: domain.User{
			Id:          id,
			Email:       "willikay11@gmail.com",
			DisplayName: "William Kamau",
			AvatarUrl:   "https://lh3.googleusercontent.com/a/ACg8ocK1k6C7GcsvTZCp2neyUKNTCMzb04bW2A13vhzaS-X1myu8iw=s96-c",
			Status:      "active",
		},
	}

	mockTxManager := &mockTxManager{}

	mockOauth2Config := &mockOauth2Config{}

	mockAuthRepo := &mockAuthRepository{
		savedUser: domain.User{
			Id:          id,
			Email:       "willikay11@gmail.com",
			DisplayName: "William Kamau",
			AvatarUrl:   "https://lh3.googleusercontent.com/a/ACg8ocK1k6C7GcsvTZCp2neyUKNTCMzb04bW2A13vhzaS-X1myu8iw=s96-c",
			Status:      "active",
		},

		savedUserIdentity: domain.UserIdentity{
			Id:            uuid.New(),
			UserId:        id,
			Provider:      "google",
			ProviderEmail: "willikay11@gmail.com",
		},

		savedRefreshToken: domain.RefreshToken{
			Id:        uuid.New(),
			UserId:    id,
			TokenHash: "b6c4f40fa59f8864d12cb24ddce52e29601de1c689f4f6c6c747c4d3fba49711",
			Family:    family,
			ExpiresAt: time.Now().Add(7 * 24 * time.Hour),
		},
	}
	t.Run("should test a valid refresh token", func(t *testing.T) {
		service := auth.NewService(mockOauth2Config, verifier, mockAuthRepo, mockTxManager, "RandDomSecret")
		got, err := service.RefreshToken(context.Background(), "k6YQl3nT18GUH3dXl_yvKcetwObqegKplMQqKeqoycA")
		assert.NoError(t, err)
		assert.Equal(t, loggedInUser.User.Email, got.User.Email)
	})

	t.Run("should test a suspended user should not receive a refresh token", func(t *testing.T) {
		mockAuthRepo.savedUser.Status = "suspended"
		service := auth.NewService(mockOauth2Config, verifier, mockAuthRepo, mockTxManager, "RandDomSecret")
		_, err := service.RefreshToken(context.Background(), "k6YQl3nT18GUH3dXl_yvKcetwObqegKplMQqKeqoycA")
		assert.ErrorIs(t, err, domain.ErrUserSuspended)
	})

	t.Run("should test a refresh token thats not found", func(t *testing.T) {
		mockAuthRepo.err = domain.ErrRefreshTokenNotFound
		service := auth.NewService(mockOauth2Config, verifier, mockAuthRepo, mockTxManager, "RandDomSecret")
		_, err := service.RefreshToken(context.Background(), "k6YQl3nT18GUH3dXl_yvKcetwObqegKplMQqKeqoycA")
		assert.ErrorIs(t, err, domain.ErrRefreshTokenNotFound)
	})

	t.Run("should test a refresh token thats is expired", func(t *testing.T) {
		mockAuthRepo.err = nil
		mockAuthRepo.savedUser.Status = "active"
		mockAuthRepo.savedRefreshToken.ExpiresAt = time.Now().Add(-60 * time.Second)
		service := auth.NewService(mockOauth2Config, verifier, mockAuthRepo, mockTxManager, "RandDomSecret")
		_, err := service.RefreshToken(context.Background(), "k6YQl3nT18GUH3dXl_yvKcetwObqegKplMQqKeqoycA")
		assert.ErrorIs(t, err, domain.ErrRefreshTokenExpired)
	})

	t.Run("should test a refresh token thats is expired", func(t *testing.T) {
		mockAuthRepo.err = nil
		mockAuthRepo.savedUser.Status = "active"
		mockAuthRepo.savedRefreshToken.ExpiresAt = time.Now().Add(60 * time.Second)
		mockAuthRepo.savedRefreshToken.RevokedAt = time.Now()
		service := auth.NewService(mockOauth2Config, verifier, mockAuthRepo, mockTxManager, "RandDomSecret")
		_, err := service.RefreshToken(context.Background(), "k6YQl3nT18GUH3dXl_yvKcetwObqegKplMQqKeqoycA")
		assert.ErrorIs(t, err, domain.ErrRefreshTokenRevoked)
	})
}
