package auth_test

import (
	"context"
	"crypto/rand"
	"crypto/rsa"
	"crypto/x509"
	"encoding/base64"
	"encoding/json"
	"encoding/pem"
	"fmt"
	"strings"
	"testing"
	"time"

	"github.com/coreos/go-oidc"
	"github.com/golang-jwt/jwt/v5"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	authsvc "github.com/willikay11/wrench/api/internal/core/services/auth"
)

const ourClientID = "wrench.apps.googleusercontent.com"

// testKeySet stands in for Google's JWKS.
//
// Verifying against a key we hold is the only way to mint a token with a
// genuinely valid signature and a deliberately wrong claim — Google will not
// sign one of those for us, and a test that cannot do it proves nothing about
// the audience check.
//
// go-oidc validates iss/aud/exp itself, so this only has to check the
// signature and hand back the raw claims.
type testKeySet struct{ pub *rsa.PublicKey }

func (k testKeySet) VerifySignature(_ context.Context, rawJWT string) ([]byte, error) {
	token, err := jwt.Parse(rawJWT, func(t *jwt.Token) (any, error) {
		// A JWKS-backed key set is equally strict about this: Google publishes
		// RSA keys, so alg=none and HS256-with-the-public-key die right here.
		if _, ok := t.Method.(*jwt.SigningMethodRSA); !ok {
			return nil, fmt.Errorf("unexpected signing method %v", t.Header["alg"])
		}

		return k.pub, nil
	}, jwt.WithoutClaimsValidation()) // claim checks belong to go-oidc
	if err != nil {
		return nil, err
	}

	return base64.RawURLEncoding.DecodeString(strings.Split(token.Raw, ".")[1])
}

// googleClaims is what a legitimate ID token for Wrench looks like. Each test
// takes this and breaks exactly one thing, so a failure names its own cause.
func googleClaims() jwt.MapClaims {
	return jwt.MapClaims{
		"iss":            authsvc.GoogleIssuer,
		"aud":            ourClientID,
		"sub":            "google-subject-123",
		"email":          "someone@example.com",
		"email_verified": true,
		"iat":            time.Now().Unix(),
		"exp":            time.Now().Add(time.Hour).Unix(),
	}
}

func TestGoogleIDTokenVerification(t *testing.T) {
	key, err := rsa.GenerateKey(rand.Reader, 2048)
	require.NoError(t, err)

	verifier := oidc.NewVerifier(
		authsvc.GoogleIssuer,
		testKeySet{&key.PublicKey},
		authsvc.GoogleOIDCConfig(ourClientID),
	)

	sign := func(t *testing.T, method jwt.SigningMethod, signingKey any, claims jwt.MapClaims) string {
		t.Helper()

		signed, err := jwt.NewWithClaims(method, claims).SignedString(signingKey)
		require.NoError(t, err)

		return signed
	}

	// A properly signed Google token, with one claim optionally altered.
	mint := func(t *testing.T, mutate func(jwt.MapClaims)) string {
		t.Helper()

		claims := googleClaims()
		if mutate != nil {
			mutate(claims)
		}

		return sign(t, jwt.SigningMethodRS256, key, claims)
	}

	verify := func(rawJWT string) error {
		_, err := verifier.Verify(context.Background(), rawJWT)
		return err
	}

	// Positive controls. Without these, every rejection below could be passing
	// because the harness mints broken tokens, which would prove nothing.
	t.Run("accepts a token minted for us", func(t *testing.T) {
		assert.NoError(t, verify(mint(t, nil)))
	})

	t.Run("accepts aud as an array containing our client id", func(t *testing.T) {
		// Google is entitled to send `aud` as a list. Rejecting that shape
		// would lock out legitimate users, not attackers.
		assert.NoError(t, verify(mint(t, func(c jwt.MapClaims) {
			c["aud"] = []string{"another-app.apps.googleusercontent.com", ourClientID}
		})))
	})

	// The confused deputy. Same Google signing keys, same issuer, unexpired,
	// structurally perfect — issued to a different application. Accepting it
	// would let anyone who can obtain a token from any Google app sign in as
	// the matching Wrench user.
	t.Run("rejects a valid signature minted for another app", func(t *testing.T) {
		err := verify(mint(t, func(c jwt.MapClaims) {
			c["aud"] = "attacker-app.apps.googleusercontent.com"
		}))

		require.Error(t, err)
		// Asserted on the message so this test fails if the token is ever
		// rejected for some incidental reason instead of the audience.
		assert.Contains(t, err.Error(), "expected audience")
	})

	t.Run("rejects a token with no audience at all", func(t *testing.T) {
		err := verify(mint(t, func(c jwt.MapClaims) { delete(c, "aud") }))

		require.Error(t, err)
		assert.Contains(t, err.Error(), "expected audience")
	})

	t.Run("rejects an issuer that is not Google", func(t *testing.T) {
		assert.Error(t, verify(mint(t, func(c jwt.MapClaims) {
			c["iss"] = "https://evil.example"
		})))
	})

	t.Run("rejects an expired token", func(t *testing.T) {
		assert.Error(t, verify(mint(t, func(c jwt.MapClaims) {
			c["exp"] = time.Now().Add(-time.Minute).Unix()
			c["iat"] = time.Now().Add(-time.Hour).Unix()
		})))
	})

	t.Run("rejects a token signed by a key that is not Google's", func(t *testing.T) {
		attackerKey, err := rsa.GenerateKey(rand.Reader, 2048)
		require.NoError(t, err)

		assert.Error(t, verify(sign(t, jwt.SigningMethodRS256, attackerKey, googleClaims())))
	})

	// The classic forgery: strip the signature and declare it unnecessary.
	t.Run("rejects alg none", func(t *testing.T) {
		unsigned, err := jwt.NewWithClaims(jwt.SigningMethodNone, googleClaims()).
			SignedString(jwt.UnsafeAllowNoneSignatureType)
		require.NoError(t, err)

		assert.Error(t, verify(unsigned))
	})

	// Algorithm confusion: sign with HS256 using Google's *public* key as the
	// HMAC secret. A verifier that picks its algorithm from the token header
	// rather than from the key type accepts this, and the public key is public.
	t.Run("rejects HS256 signed with the public key", func(t *testing.T) {
		der, err := x509.MarshalPKIXPublicKey(&key.PublicKey)
		require.NoError(t, err)

		publicKeyPEM := pem.EncodeToMemory(&pem.Block{Type: "PUBLIC KEY", Bytes: der})

		assert.Error(t, verify(sign(t, jwt.SigningMethodHS256, publicKeyPEM, googleClaims())))
	})

	t.Run("rejects a tampered payload", func(t *testing.T) {
		parts := strings.Split(mint(t, nil), ".")

		payload, err := base64.RawURLEncoding.DecodeString(parts[1])
		require.NoError(t, err)

		var claims map[string]any
		require.NoError(t, json.Unmarshal(payload, &claims))

		claims["email"] = "attacker@example.com"

		edited, err := json.Marshal(claims)
		require.NoError(t, err)

		parts[1] = base64.RawURLEncoding.EncodeToString(edited)

		assert.Error(t, verify(strings.Join(parts, ".")))
	})
}

// The check exists because it is configured. If someone sets
// SkipClientIDCheck, or drops the client id, every audience test above still
// needs to fail — this asserts the configuration itself.
func TestGoogleOIDCConfigEnforcesAudience(t *testing.T) {
	config := authsvc.GoogleOIDCConfig(ourClientID)

	assert.Equal(t, ourClientID, config.ClientID)
	assert.False(t, config.SkipClientIDCheck)
	assert.False(t, config.SkipIssuerCheck)
	assert.False(t, config.SkipExpiryCheck)
}
