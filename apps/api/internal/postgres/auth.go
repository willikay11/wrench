package postgres

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"time"

	"github.com/google/uuid"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/willikay11/wrench/api/internal/core/domain"
)

type authRepo struct {
	db *pgxpool.Pool
}

func NewAuthRepository(db *pgxpool.Pool) *authRepo {
	return &authRepo{db: db}
}

const userIdentityQuery = `
	SELECT
		id,
		userId,
		provider,
		providerEmail
	FROM useridentities 
	WHERE providerUserId = $1
		AND provider = $2`

func (r *authRepo) FindUserIdentity(ctx context.Context, providerUserId string, provider string) (domain.UserIdentity, error) {
	ctx, cancel := context.WithTimeout(ctx, 5*time.Second)
	defer cancel()

	var userIdentity domain.UserIdentity

	err := from(ctx, r.db).QueryRow(ctx, userIdentityQuery, providerUserId, provider).Scan(&userIdentity.Id, &userIdentity.UserId, &userIdentity.Provider, &userIdentity.ProviderEmail)

	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return domain.UserIdentity{}, domain.ErrUserIdentityNotFound
		}

		return domain.UserIdentity{}, fmt.Errorf("find user identity: %w", err)
	}

	return userIdentity, nil
}

const userQuery = `
	SELECT
		id,
		displayName,
		email,
		avatarUrl,
		emailVerified
	FROM users 
	WHERE email = $1`

func (r *authRepo) FindUser(ctx context.Context, email string) (domain.User, error) {
	ctx, cancel := context.WithTimeout(ctx, 5*time.Second)
	defer cancel()

	var user domain.User
	var userId string

	err := from(ctx, r.db).QueryRow(ctx, userQuery, email).Scan(&userId, &user.DisplayName, &user.Email, &user.AvatarUrl, &user.EmailVerified)

	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return domain.User{}, domain.ErrUserNotFound
		}

		return domain.User{}, fmt.Errorf("find user: %w", err)
	}

	user.Id, err = uuid.Parse(userId)
	if err != nil {
		return domain.User{}, fmt.Errorf("parse user id: %w", err)
	}

	return user, nil
}

const createUserQuery = `
	INSERT INTO users (email, displayName, avatarUrl, status, emailVerified)
	VALUES ($1,$2,$3,$4,$5) RETURNING id`

func (r *authRepo) CreateUser(ctx context.Context, email string, displayName string, avatarUrl string, emailVerified bool) (domain.User, error) {
	ctx, cancel := context.WithTimeout(ctx, 5*time.Second)
	defer cancel()

	var userId string

	err := from(ctx, r.db).QueryRow(ctx, createUserQuery, email, displayName, avatarUrl, "active", emailVerified).Scan(&userId)
	if err != nil {
		return domain.User{}, fmt.Errorf("create user entry: %w", err)
	}

	uid, err := uuid.Parse(userId)
	if err != nil {
		return domain.User{}, fmt.Errorf("parse user id: %w", err)
	}

	return domain.User{
		Id:          uid,
		Email:       email,
		DisplayName: displayName,
		AvatarUrl:   avatarUrl,
	}, nil
}

const createUserIdentityQuery = `
	INSERT INTO useridentities (userId, provider, providerEmail, providerUserId)
	VALUES ($1,$2,$3,$4)`

func (r *authRepo) CreateUserIdentity(ctx context.Context, userId uuid.UUID, provider string, providerEmail string, providerUserId string) error {
	ctx, cancel := context.WithTimeout(ctx, 5*time.Second)
	defer cancel()

	_, err := from(ctx, r.db).Exec(ctx, createUserIdentityQuery, userId, provider, providerEmail, providerUserId)
	if err != nil {
		return fmt.Errorf("create user identity entry: %w", err)
	}
	return nil
}

const updateLastLoginQuery = `
	UPDATE users 
	SET lastLogin = NOW()
	WHERE id = $1
`

func (r *authRepo) UpdateLastLogin(ctx context.Context, id uuid.UUID) error {
	ctx, cancel := context.WithTimeout(ctx, 5*time.Second)
	defer cancel()

	_, err := from(ctx, r.db).Exec(ctx, updateLastLoginQuery, id)
	if err != nil {
		return fmt.Errorf("update last login: %w", err)
	}
	return nil
}

const linkUserIdentityQuery = `
	UPDATE useridentities 
	SET userId = $1
	WHERE id = $2
`

func (r *authRepo) LinkUserIdentity(ctx context.Context, userId uuid.UUID, userIdentityId uuid.UUID) error {
	ctx, cancel := context.WithTimeout(ctx, 5*time.Second)
	defer cancel()

	_, err := from(ctx, r.db).Exec(ctx, linkUserIdentityQuery, userId, userIdentityId)
	if err != nil {
		return fmt.Errorf("update last login: %w", err)
	}
	return nil
}

const createRefreshTokenQuery = `
	INSERT INTO refreshtokens (userId, tokenHash, family, expiresAt)
	VALUES ($1,$2,$3,$4)`

func (r *authRepo) CreateRefreshToken(ctx context.Context, userId uuid.UUID, tokenHash string, family uuid.UUID, expiresAt time.Time) error {
	ctx, cancel := context.WithTimeout(ctx, 5*time.Second)
	defer cancel()

	_, err := from(ctx, r.db).Exec(ctx, createRefreshTokenQuery, userId, tokenHash, family, expiresAt)
	if err != nil {
		return fmt.Errorf("create refresh token entry: %w", err)
	}

	return nil
}
