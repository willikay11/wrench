package ports

import (
	"context"

	"github.com/google/uuid"

	"github.com/willikay11/wrench/api/internal/core/domain"
)

// MediaStore keeps users' own images — their photos, not catalogue data — per
// ADR-007.
type MediaStore interface {
	// UploadCarPhoto stores an image in the car's photo folder.
	UploadCarPhoto(ctx context.Context, carId uuid.UUID, image []byte) (domain.StoredImage, error)
	// SignedURL returns a delivery URL for a stored image. The signature stops
	// the URL being altered to reach another asset or another transformation.
	SignedURL(publicId string) (string, error)
	// Delete removes a stored image.
	Delete(ctx context.Context, publicId string) error
}
