package media

import (
	"bytes"
	"context"
	"fmt"

	cloudinary "github.com/cloudinary/cloudinary-go/v2"
	"github.com/cloudinary/cloudinary-go/v2/api"
	"github.com/cloudinary/cloudinary-go/v2/api/uploader"
	"github.com/google/uuid"

	"github.com/willikay11/wrench/api/internal/core/domain"
)

// Store keeps users' photos in Cloudinary as authenticated assets (ADR-007):
// not reachable by a plain URL, only by one this server has signed.
type Store struct {
	cld *cloudinary.Cloudinary
}

// NewStore connects with the full credential, which uploading and signing both
// need.
//
// The SDK accepts a malformed URL without complaint — an https:// value parses,
// and every upload then fails at request time — so the scheme is checked here,
// where a misconfiguration can be reported once at startup.
func NewStore(cloudinaryURL string) (*Store, error) {
	if _, err := NewPublicImages(cloudinaryURL); err != nil {
		return nil, err
	}

	cld, err := cloudinary.NewFromURL(cloudinaryURL)
	if err != nil {
		return nil, ErrInvalidCloudinaryURL
	}

	return &Store{cld: cld}, nil
}

// carPhotoFolder is the ADR-007 folder for a car's photo.
func carPhotoFolder(carId uuid.UUID) string {
	return "wrench/cars/" + carId.String() + "/photo"
}

func (s *Store) UploadCarPhoto(ctx context.Context, carId uuid.UUID, image []byte) (domain.StoredImage, error) {
	result, err := s.cld.Upload.Upload(ctx, bytes.NewReader(image), uploader.UploadParams{
		Folder:       carPhotoFolder(carId),
		ResourceType: "image",
		Type:         api.Authenticated,
		// A fresh public id per upload, never a reused one: a replaced photo's
		// old asset is deleted separately, and must not be the new one.
		UniqueFilename: boolPtr(true),
		Overwrite:      boolPtr(false),
		// The API has already checked the content's magic bytes. This is
		// Cloudinary refusing anything else too, as a second line.
		AllowedFormats: api.CldAPIArray{"jpg", "png", "webp", "heic", "heif"},
	})
	if err != nil {
		return domain.StoredImage{}, fmt.Errorf("upload car photo: %w", err)
	}
	if result.Error.Message != "" {
		return domain.StoredImage{}, fmt.Errorf("upload car photo: %s", result.Error.Message)
	}

	return domain.StoredImage{
		PublicId:  result.PublicID,
		SecureURL: result.SecureURL,
		Width:     result.Width,
		Height:    result.Height,
	}, nil
}

// SignedURL builds a signed delivery URL with Cloudinary choosing format and
// quality, so a HEIC upload reaches a browser in a format it can show.
//
// The signature covers the public id and the transformation, so neither can be
// changed. It does not expire: time-limited delivery needs Cloudinary's
// token-based authentication, which is plan-dependent (ADR-007, amended).
func (s *Store) SignedURL(publicId string) (string, error) {
	image, err := s.cld.Image(publicId)
	if err != nil {
		return "", fmt.Errorf("sign photo url: %w", err)
	}

	image.DeliveryType = api.Authenticated
	image.Transformation = "f_auto,q_auto"
	image.Config.URL.SignURL = true

	url, err := image.String()
	if err != nil {
		return "", fmt.Errorf("sign photo url: %w", err)
	}

	return url, nil
}

func (s *Store) Delete(ctx context.Context, publicId string) error {
	result, err := s.cld.Upload.Destroy(ctx, uploader.DestroyParams{
		PublicID:     publicId,
		Type:         string(api.Authenticated),
		ResourceType: "image",
		// Purge cached copies too, so a replaced photo stops being served.
		Invalidate: boolPtr(true),
	})
	if err != nil {
		return fmt.Errorf("delete photo: %w", err)
	}
	if result.Error.Message != "" {
		return fmt.Errorf("delete photo: %s", result.Error.Message)
	}

	return nil
}

func boolPtr(value bool) *bool {
	return &value
}
