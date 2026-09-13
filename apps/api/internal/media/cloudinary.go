// Package media adapts the platform's image host, Cloudinary per ADR-007.
package media

import (
	"errors"
	"net/url"
	"strings"
)

var ErrInvalidCloudinaryURL = errors.New("CLOUDINARY_URL is not a cloudinary:// URL")

// PublicImages builds delivery URLs for images anyone may load: catalogue
// images, which are platform reference data rather than a user's own photos.
// A user's photos are authenticated and signed per request (ADR-007) and do
// not come through here.
type PublicImages struct {
	cloudName string
}

// NewPublicImages reads the cloud name from a cloudinary://key:secret@cloud URL.
// Only the cloud name is kept; the key and secret are not needed to build a
// public URL and are not held.
func NewPublicImages(cloudinaryURL string) (*PublicImages, error) {
	parsed, err := url.Parse(cloudinaryURL)
	if err != nil || parsed.Scheme != "cloudinary" || parsed.Host == "" {
		return nil, ErrInvalidCloudinaryURL
	}

	return &PublicImages{cloudName: parsed.Host}, nil
}

// PublicURL returns the delivery URL for a public id, with Cloudinary choosing
// the format and quality per browser. It reports false on a nil receiver — an
// unconfigured locator — so callers can leave the image out instead.
func (p *PublicImages) PublicURL(publicId string) (string, bool) {
	if p == nil || publicId == "" {
		return "", false
	}

	// A public id names a folder path, so each segment is escaped on its own
	// and the slashes between them survive.
	segments := strings.Split(publicId, "/")
	for i, segment := range segments {
		segments[i] = url.PathEscape(segment)
	}

	return "https://res.cloudinary.com/" + url.PathEscape(p.cloudName) +
		"/image/upload/f_auto,q_auto/" + strings.Join(segments, "/"), true
}
