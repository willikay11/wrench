package media_test

import (
	"strings"
	"testing"

	"github.com/stretchr/testify/require"

	"github.com/willikay11/wrench/api/internal/media"
)

// The SDK itself accepts this value. The store must not.
func TestNewStoreRefusesAValueTheSDKWouldAccept(t *testing.T) {
	for _, value := range []string{"https://hsyqjv6g", "", "cloudinary://"} {
		_, err := media.NewStore(value)
		require.ErrorIs(t, err, media.ErrInvalidCloudinaryURL, "value %q", value)
	}
}

// Signing needs no network, so the URL's shape is checked directly.
func TestSignedURLIsAuthenticatedSignedAndCarriesNoSecret(t *testing.T) {
	store, err := media.NewStore("cloudinary://123456789:not-a-real-secret@wrench-cloud")
	require.NoError(t, err)

	url, err := store.SignedURL("wrench/cars/abc/photo/xyz")
	require.NoError(t, err)

	require.True(t, strings.HasPrefix(url, "https://res.cloudinary.com/wrench-cloud/image/authenticated/"), url)
	require.Contains(t, url, "/s--", "the URL must carry a signature")
	require.Contains(t, url, "f_auto,q_auto", "HEIC has to reach browsers in a format they show")
	require.Contains(t, url, "wrench/cars/abc/photo/xyz")
	require.NotContains(t, url, "not-a-real-secret")
	require.NotContains(t, url, "123456789")
}

// A signature covers the path. Two different photos must not share one, or a
// URL could be edited to reach the other.
func TestSignedURLSignatureDependsOnThePublicId(t *testing.T) {
	store, err := media.NewStore("cloudinary://123456789:not-a-real-secret@wrench-cloud")
	require.NoError(t, err)

	first, err := store.SignedURL("wrench/cars/abc/photo/one")
	require.NoError(t, err)
	second, err := store.SignedURL("wrench/cars/abc/photo/two")
	require.NoError(t, err)

	signature := func(url string) string {
		start := strings.Index(url, "/s--")
		end := strings.Index(url[start+4:], "--")
		return url[start : start+4+end]
	}

	require.NotEqual(t, signature(first), signature(second))
}
