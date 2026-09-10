package auth

import "github.com/coreos/go-oidc"

// GoogleIssuer is both the discovery URL the provider is built from and the
// `iss` claim Google puts in every ID token it mints.
const GoogleIssuer = "https://accounts.google.com"

// GoogleOIDCConfig is the single definition of how a Google ID token is
// verified. main.go builds the real verifier from it against Google's live
// JWKS; the tests build one from it against a throwaway key. Weakening a rule
// here — adding SkipClientIDCheck, say — fails those tests rather than
// quietly shipping.
//
// ClientID is the load-bearing field. Google signs every ID token for every
// application with the same keys, so without an audience check a token minted
// for any other Google app passes signature, issuer and expiry validation and
// would log its bearer into the matching Wrench account. go-oidc fails closed
// on this: an empty ClientID is an error, not a skipped check.
func GoogleOIDCConfig(clientID string) *oidc.Config {
	return &oidc.Config{ClientID: clientID}
}
