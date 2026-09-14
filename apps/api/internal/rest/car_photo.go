package rest

import (
	"errors"
	"io"
	"net/http"
	"strings"

	"github.com/gabriel-vasile/mimetype"
	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/rs/zerolog/log"

	"github.com/willikay11/wrench/api/internal/core/domain"
)

// maxPhotoRequestBytes bounds the whole multipart body: the photo plus the few
// kilobytes of boundaries and headers around it. The photo itself is held to
// exactly domain.MaxPhotoBytes below.
const maxPhotoRequestBytes = domain.MaxPhotoBytes + 64<<10

// UploadCarPhoto sets a car's primary photo from a multipart upload.
//
// This is a dedicated endpoint rather than the generic upload-then-attach flow,
// because that flow has the client hand back a URL or public id, which would
// let a caller attach an asset they do not own. Here the car in the path is
// checked for ownership before anything is stored, and the server writes the
// reference itself (ADR-007, amended).
func (h *CarHandler) UploadCarPhoto(w http.ResponseWriter, r *http.Request) {
	carId, err := uuid.Parse(chi.URLParam(r, "carId"))
	if err != nil {
		writeProblem(w, r, Problem{Status: http.StatusNotFound, Detail: "No car with that id."})
		return
	}

	image, problem := readPhoto(w, r)
	if problem != nil {
		writeProblem(w, r, *problem)
		return
	}

	photo, err := h.carService.SetCarPhoto(r.Context(), carId, domain.MustUserID(r.Context()), image)

	switch {
	case errors.Is(err, domain.ErrCarNotFound):
		writeProblem(w, r, Problem{Status: http.StatusNotFound, Detail: "No car with that id."})
		return
	case errors.Is(err, domain.ErrMediaUnavailable):
		withUser(log.Error(), r.Context()).Msg("Photo upload refused: media storage is not configured")
		writeProblem(w, r, Problem{
			Status: http.StatusServiceUnavailable,
			Detail: "Photo uploads are unavailable right now. Please try again later.",
		})
		return
	case err != nil:
		withUser(log.Error().Err(err), r.Context()).Msg("Failed to store car photo")
		writeProblem(w, r, Problem{
			Status: http.StatusBadGateway,
			Detail: "The photo could not be stored. Please try again.",
		})
		return
	}

	writeJSON(w, http.StatusCreated, photo)
}

// readPhoto reads the "file" part of a multipart body and decides whether it
// may be a car photo. It answers with a problem for anything else.
//
// The type is decided by the content's magic bytes, never by the file name or
// the part's declared Content-Type (FR-37, NFR-25): a PNG named .jpg is a PNG,
// and an SVG named .jpg is still an SVG.
func readPhoto(w http.ResponseWriter, r *http.Request) ([]byte, *Problem) {
	r.Body = http.MaxBytesReader(w, r.Body, maxPhotoRequestBytes)

	reader, err := r.MultipartReader()
	if err != nil {
		problem := malformedBody("The body must be multipart/form-data, with the photo in a field named file.")
		return nil, &problem
	}

	for {
		part, err := reader.NextPart()
		if errors.Is(err, io.EOF) {
			problem := invalidFile("This field is required")
			return nil, &problem
		}
		if err != nil {
			return nil, readProblem(err)
		}

		// Other fields are not an error, and are skipped; NextPart discards
		// whatever of them was not read.
		if part.FormName() != "file" {
			continue
		}

		// One byte past the limit: its presence is the only way to know a file
		// is too large without reading all of it.
		data, err := io.ReadAll(io.LimitReader(part, domain.MaxPhotoBytes+1))
		_ = part.Close()
		if err != nil {
			return nil, readProblem(err)
		}

		if len(data) > domain.MaxPhotoBytes {
			problem := invalidFile("This file must be at most 10MB")
			return nil, &problem
		}
		if len(data) == 0 {
			problem := invalidFile("This file is empty")
			return nil, &problem
		}

		detected := strings.SplitN(mimetype.Detect(data).String(), ";", 2)[0]
		if !domain.AcceptedCarPhotoType(detected) {
			problem := invalidFile("This file must be a JPEG, PNG, WebP or HEIC image")
			return nil, &problem
		}

		return data, nil
	}
}

// readProblem answers a body that failed while being read: too large for the
// request limit, or not a readable multipart body at all.
func readProblem(err error) *Problem {
	var tooLarge *http.MaxBytesError
	if errors.As(err, &tooLarge) {
		problem := invalidFile("This file must be at most 10MB")
		return &problem
	}

	problem := malformedBody("The body must be multipart/form-data, with the photo in a field named file.")
	return &problem
}

func invalidFile(reason string) Problem {
	return Problem{
		Type:          typeInvalidFile,
		Title:         "The photo could not be accepted",
		Status:        http.StatusUnprocessableEntity,
		InvalidParams: []InvalidParam{{Name: "file", Reason: reason}},
	}
}
