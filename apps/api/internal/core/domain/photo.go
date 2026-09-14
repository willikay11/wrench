package domain

import "errors"

// MaxPhotoBytes is the largest photo accepted (FR-35, NFR-25).
const MaxPhotoBytes = 10 << 20

var (
	ErrImageTooLarge    = errors.New("image too large")
	ErrUnsupportedImage = errors.New("unsupported image type")
	// ErrMediaUnavailable means media storage is not configured. It is the
	// deployment's problem, not the request's, and says nothing about the car.
	ErrMediaUnavailable = errors.New("media storage unavailable")
)

// Where the image a car is shown with came from.
const (
	PhotoSourceUpload    = "upload"
	PhotoSourceCatalogue = "catalogue"
)

// carPhotoTypes are the types a car photo may be, by the MIME type its content
// is detected as — never by its file name or declared type (FR-37, NFR-25).
// SVG is absent on purpose: it is an image format that can carry script.
var carPhotoTypes = map[string]bool{
	"image/jpeg": true,
	"image/png":  true,
	"image/webp": true,
	"image/heic": true,
	"image/heif": true,
}

// AcceptedCarPhotoType reports whether content detected as this MIME type may
// be a car photo.
func AcceptedCarPhotoType(detected string) bool {
	return carPhotoTypes[detected]
}

// StoredImage is an image the media store has accepted.
type StoredImage struct {
	PublicId  string
	SecureURL string
	Width     int
	Height    int
}

// CarPhoto is the image a car is shown with, resolved by the server in one
// order — the owner's upload, then the linked generation's catalogue image —
// so no client re-implements it (ADR-010).
type CarPhoto struct {
	Url    string `json:"url"`
	Source string `json:"source"`
	// Attribution is set for a catalogue image, whose licence requires credit,
	// and null for the owner's own upload.
	Attribution *string `json:"attribution"`
}
