package domain

import (
	"errors"
	"time"

	"github.com/golang-jwt/jwt/v5"
	"github.com/google/uuid"
)

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
