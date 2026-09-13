package media_test

import (
	"testing"

	"github.com/stretchr/testify/require"

	"github.com/willikay11/wrench/api/internal/media"
)

func TestNewPublicImagesReadsTheCloudName(t *testing.T) {
	images, err := media.NewPublicImages("cloudinary://123456:s3cr3t@wrench-cloud")
	require.NoError(t, err)

	url, ok := images.PublicURL("wrench/catalogue/z33")
	require.True(t, ok)
	require.Equal(t, "https://res.cloudinary.com/wrench-cloud/image/upload/f_auto,q_auto/wrench/catalogue/z33", url)
	// The credentials are needed to upload, never to link.
	require.NotContains(t, url, "s3cr3t")
	require.NotContains(t, url, "123456")
}

// The value the local .env holds today is one of these — a plain https URL.
func TestNewPublicImagesRefusesAnythingButACloudinaryURL(t *testing.T) {
	for _, value := range []string{"", "https://hsyqjv6g", "cloudinary://", "not a url", "cloudinary://key:secret@"} {
		_, err := media.NewPublicImages(value)
		require.ErrorIs(t, err, media.ErrInvalidCloudinaryURL, "value %q", value)
	}
}

func TestPublicURLEscapesEachSegmentButKeepsTheFolders(t *testing.T) {
	images, err := media.NewPublicImages("cloudinary://k:s@cloud")
	require.NoError(t, err)

	url, ok := images.PublicURL("wrench/catalogue/mx-5 miata?x=1")
	require.True(t, ok)
	require.Equal(t, "https://res.cloudinary.com/cloud/image/upload/f_auto,q_auto/wrench/catalogue/mx-5%20miata%3Fx=1", url)
}

func TestPublicURLOnAnUnconfiguredLocatorReportsNoURL(t *testing.T) {
	var images *media.PublicImages

	_, ok := images.PublicURL("wrench/catalogue/z33")
	require.False(t, ok)

	configured, err := media.NewPublicImages("cloudinary://k:s@cloud")
	require.NoError(t, err)
	_, ok = configured.PublicURL("")
	require.False(t, ok)
}
