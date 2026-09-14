package domain_test

import (
	"testing"

	"github.com/stretchr/testify/require"

	"github.com/willikay11/wrench/api/internal/core/domain"
)

func TestCarPhotosAreTheImageTypesFR35Names(t *testing.T) {
	for _, accepted := range []string{"image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"} {
		require.True(t, domain.AcceptedCarPhotoType(accepted), accepted)
	}
}

// SVG is the one that matters most: it passes for an image and can run script.
func TestCarPhotosRefuseEverythingElse(t *testing.T) {
	for _, refused := range []string{"image/svg+xml", "application/pdf", "text/html", "image/gif", "image/avif", "application/octet-stream", ""} {
		require.False(t, domain.AcceptedCarPhotoType(refused), refused)
	}
}
