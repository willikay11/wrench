package domain

import (
	"errors"

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
}

type UserIdentity struct {
	Id            uuid.UUID
	UserId        string
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

var ErrUserIdentityNotFound = errors.New("user identity not found")
var ErrUserNotFound = errors.New("user not found")
var ErrUserNotVerified = errors.New("user not verified")

const UserCreated = "UserCreated"
const UserLoggedIn = "UserLoggedIn"
