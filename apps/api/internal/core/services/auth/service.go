package auth

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"errors"
	"time"

	"github.com/coreos/go-oidc"
	"github.com/golang-jwt/jwt/v5"
	"github.com/google/uuid"
	"github.com/willikay11/wrench/api/internal/core/domain"
	"github.com/willikay11/wrench/api/internal/core/ports"
	"golang.org/x/oauth2"
)

type service struct {
	oauthConfig oauth2.Config
	verifier    *oidc.IDTokenVerifier
	authRepo    ports.AuthRepository
	txManager   ports.TxManager
	jwtSecret   string
}

func NewService(
	oauthConfig oauth2.Config,
	verifier *oidc.IDTokenVerifier,
	authRepo ports.AuthRepository,
	txManager ports.TxManager,
	jwtSecret string) *service {
	return &service{
		oauthConfig: oauthConfig,
		verifier:    verifier,
		authRepo:    authRepo,
		txManager:   txManager,
		jwtSecret:   jwtSecret,
	}
}

func (s *service) LoginWithGoogle(ctx context.Context, code string, verifier string) (domain.LoggedInUser, string, error) {
	var userMessage string
	token, err := s.oauthConfig.Exchange(ctx, code, oauth2.VerifierOption(verifier))
	if err != nil {
		return domain.LoggedInUser{}, "", err
	}

	rawIdToken, ok := token.Extra("id_token").(string)
	if !ok {
		return domain.LoggedInUser{}, "", err
	}

	idToken, err := s.verifier.Verify(ctx, rawIdToken)
	if err != nil {
		return domain.LoggedInUser{}, "", err
	}


	var claims struct {
		Subject string `json:"sub"`
		Email   string `json:"email"`
		Name    string `json:"name"`
		Picture string `json:"picture"`
	}

	if err := idToken.Claims(&claims); err != nil {
		return domain.LoggedInUser{}, "", nil
	}

	var loggedInUser domain.LoggedInUser

	err = s.txManager.WithinTransaction(ctx, func(ctx context.Context) error {
		var user domain.User
		user, err = s.authRepo.FindUser(ctx, claims.Email)

		if err != nil {
			if errors.Is(err, domain.ErrUserNotFound) {
				// Register user
				user, err = s.authRepo.CreateUser(ctx, claims.Email, claims.Name, claims.Picture, true)
				if err != nil {
					return err
				}

				err = s.authRepo.CreateUserIdentity(ctx, user.Id, "google", claims.Email, claims.Subject)
				if err != nil {
					return err
				}

				userMessage = domain.UserCreated
			}
		} else {
			userIdentity, err := s.authRepo.FindUserIdentity(ctx, claims.Subject, "google")

			if err != nil {
				if errors.Is(err, domain.ErrUserIdentityNotFound) {
					if user.EmailVerified == false {
						return domain.ErrUserNotVerified
					}
					err := s.authRepo.LinkUserIdentity(ctx, user.Id, userIdentity.Id)
					if err != nil {
						return err
					}
				}
				return err
			}

			userMessage = domain.UserLoggedIn
		}

		jwtToken, err := s.generateJWTToken(user.Id, claims.Name)

		if err != nil {
			return err
		}

		opaqueToken, err := generateOpaqueToken(32)

		if err != nil {
			return err
		}

		hashedOpaqueToken := hashOpaqueToken(opaqueToken)

		err = s.authRepo.UpdateLastLogin(ctx, user.Id)

		if err != nil {
			return err
		}

		family := uuid.New()

		err = s.authRepo.CreateRefreshToken(ctx, user.Id, hashedOpaqueToken, family, time.Now().Add(7*24*time.Hour))

		if err != nil {
			return err
		}

		loggedInUser = domain.LoggedInUser{
			AccessToken:  jwtToken,
			ExpiresIn:    900,
			RefreshToken: opaqueToken,
			User: domain.User{
				Id:          user.Id,
				Email:       claims.Email,
				DisplayName: claims.Name,
				AvatarUrl:   claims.Picture,
			},
		}
		return nil
	})

	if err != nil {
		return domain.LoggedInUser{}, "", err
	}

	return loggedInUser, userMessage, nil
}

func (s *service) generateJWTToken(userId uuid.UUID, displayName string) (string, error) {
	userIdStr := userId.String()
	claims := domain.JWTClaims{
		UserID:      userIdStr,
		DisplayName: displayName,
		RegisteredClaims: jwt.RegisteredClaims{
			ExpiresAt: jwt.NewNumericDate(time.Now().Add(15 * time.Minute)),
			IssuedAt:  jwt.NewNumericDate(time.Now()),
			NotBefore: jwt.NewNumericDate(time.Now()),
			Issuer:    "wrench",
		},
	}

	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	tokenString, err := token.SignedString([]byte(s.jwtSecret))
	if err != nil {
		return "", err
	}
	return tokenString, nil
}

func generateOpaqueToken(byteLength int) (string, error) {
	b := make([]byte, byteLength)
	_, err := rand.Read(b)
	if err != nil {
		return "", err
	}
	// Use URLEncoding to avoid dangerous URL characters like '+' and '/'
	return base64.RawURLEncoding.EncodeToString(b), nil
}

func hashOpaqueToken(opaqueToken string) string {
	sum := sha256.Sum256([]byte(opaqueToken))
	return hex.EncodeToString(sum[:])
}
