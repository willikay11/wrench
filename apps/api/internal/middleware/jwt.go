package CustomMiddleware

import (
	"encoding/json"
	"fmt"
	"net/http"
	"strings"

	"github.com/golang-jwt/jwt/v5"
	"github.com/google/uuid"
	"github.com/willikay11/wrench/api/internal/core/domain"
)

func AuthenticateJWT(secretKey string) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			var jwtKey = []byte(secretKey)

			ctx := r.Context()
			bearerToken := r.Header.Get("Authorization")

			if bearerToken == "" {
				payload := map[string]string{
					"message": "Unauthorized",
				}

				w.Header().Set("Content-Type", "application/json")
				w.WriteHeader(http.StatusUnauthorized)
				json.NewEncoder(w).Encode(payload)
				return
			}

			// RFC 7235 makes the auth-scheme case-insensitive, so `bearer` and
			// `BEARER` are as valid as `Bearer`. The scheme is also required:
			// accepting a bare token would mean honouring a header shape no
			// client should be sending, and silently widening the contract.
			scheme, credentials, hasScheme := strings.Cut(bearerToken, " ")
			bearerToken = strings.TrimSpace(credentials)

			if !hasScheme || !strings.EqualFold(scheme, "bearer") || bearerToken == "" {
				payload := map[string]string{
					"message": "Unauthorized",
				}
				w.Header().Set("Content-Type", "application/json")
				w.WriteHeader(http.StatusForbidden)
				json.NewEncoder(w).Encode(payload)
				return
			}

			token, err := jwt.ParseWithClaims(bearerToken, &domain.JWTClaims{}, func(token *jwt.Token) (interface{}, error) {
				if _, ok := token.Method.(*jwt.SigningMethodHMAC); !ok {
					return nil, fmt.Errorf("unexpected signing method: %v", token.Header["alg"])
				}

				return jwtKey, nil
			})

			if err != nil {
				payload := map[string]string{
					"message": "Unauthorized",
				}
				w.Header().Set("Content-Type", "application/json")
				w.WriteHeader(http.StatusUnauthorized)
				json.NewEncoder(w).Encode(payload)
				return
			}

			if !token.Valid {
				payload := map[string]string{
					"message": "Unauthorized",
				}
				w.Header().Set("Content-Type", "application/json")
				w.WriteHeader(http.StatusUnauthorized)
				json.NewEncoder(w).Encode(payload)
				return
			}

			claims, ok := token.Claims.(*domain.JWTClaims)

			if !ok {
				payload := map[string]string{
					"message": "Unauthorized",
				}
				w.Header().Set("Content-Type", "application/json")
				w.WriteHeader(http.StatusUnauthorized)
				json.NewEncoder(w).Encode(payload)
				return
			}

			// Parsed here, once, so handlers receive a uuid.UUID rather than
			// a string each of them has to parse and each of them could get
			// wrong. A subject that is not a UUID is a token we did not mint.
			userID, parseErr := uuid.Parse(claims.UserID)

			if parseErr != nil {
				payload := map[string]string{
					"message": "Unauthorized",
				}
				w.Header().Set("Content-Type", "application/json")
				w.WriteHeader(http.StatusForbidden)
				json.NewEncoder(w).Encode(payload)
				return
			}

			ctx = domain.WithUserID(ctx, userID)

			next.ServeHTTP(w, r.WithContext(ctx))
		})
	}
}
