package rest_test

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"mime/multipart"
	"net/http"
	"net/http/httptest"
	"net/textproto"
	"strings"
	"testing"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/stretchr/testify/require"

	"github.com/willikay11/wrench/api/internal/core/domain"
	"github.com/willikay11/wrench/api/internal/rest"
)

/*
POST /v1/cars/{carId}/photo reads a multipart body, decides from the content's
magic bytes whether it may be a car photo, and hands it to the service. Whether
the car is the caller's, and what happens in storage, are the service's and
tested there; here the subject is what the endpoint accepts and how it refuses.
*/

// The fewest bytes each format's signature needs.
var (
	pngBytes  = []byte("\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01\x08\x02\x00\x00\x00")
	jpegBytes = []byte("\xff\xd8\xff\xe0\x00\x10JFIF\x00\x01\x01\x00\x00\x01\x00\x01\x00\x00")
	webpBytes = []byte("RIFF\x24\x00\x00\x00WEBPVP8 \x18\x00\x00\x00\x30\x01\x00\x9d\x01\x2a")
	heicBytes = []byte("\x00\x00\x00\x18ftypheic\x00\x00\x00\x00mif1heic\x00\x00\x00\x00")
	svgBytes  = []byte(`<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>`)
	pdfBytes  = []byte("%PDF-1.4\n%\xe2\xe3\xcf\xd3\n1 0 obj\n<<>>\nendobj\n")
	htmlBytes = []byte("<!DOCTYPE html><html><body><script>alert(1)</script></body></html>")
)

type photoFake struct {
	calls    int
	carId    uuid.UUID
	received []byte
	photo    domain.CarPhoto
	err      error
	fakeCarService
}

func (f *photoFake) SetCarPhoto(_ context.Context, carId, _ uuid.UUID, image []byte) (domain.CarPhoto, error) {
	f.calls++
	f.carId, f.received = carId, image
	return f.photo, f.err
}

// fakeCarService also has to satisfy the port for the other tests.
func (f *fakeCarService) SetCarPhoto(context.Context, uuid.UUID, uuid.UUID, []byte) (domain.CarPhoto, error) {
	f.calls++
	return domain.CarPhoto{}, f.err
}

type part struct {
	field       string
	filename    string
	contentType string
	data        []byte
}

func uploadPhoto(t *testing.T, service *photoFake, carId string, parts ...part) *httptest.ResponseRecorder {
	t.Helper()

	var body bytes.Buffer
	writer := multipart.NewWriter(&body)
	for _, p := range parts {
		header := make(textproto.MIMEHeader)
		header.Set("Content-Disposition", fmt.Sprintf(`form-data; name=%q; filename=%q`, p.field, p.filename))
		header.Set("Content-Type", p.contentType)
		w, err := writer.CreatePart(header)
		require.NoError(t, err)
		_, err = w.Write(p.data)
		require.NoError(t, err)
	}
	require.NoError(t, writer.Close())

	return send(t, service, carId, writer.FormDataContentType(), &body)
}

func send(t *testing.T, service *photoFake, carId, contentType string, body *bytes.Buffer) *httptest.ResponseRecorder {
	t.Helper()

	router := chi.NewRouter()
	router.Post("/v1/cars/{carId}/photo", rest.NewCarHandler(service).UploadCarPhoto)

	request := httptest.NewRequest(http.MethodPost, "/v1/cars/"+carId+"/photo", body)
	request.Header.Set("Content-Type", contentType)
	request = request.WithContext(domain.WithUserID(request.Context(), uuid.New()))

	recorder := httptest.NewRecorder()
	router.ServeHTTP(recorder, request)

	return recorder
}

func photoProblem(t *testing.T, recorder *httptest.ResponseRecorder) rest.Problem {
	t.Helper()

	require.Equal(t, "application/problem+json", recorder.Header().Get("Content-Type"))
	var problem rest.Problem
	require.NoError(t, json.Unmarshal(recorder.Body.Bytes(), &problem))
	require.Equal(t, recorder.Code, problem.Status)
	return problem
}

func TestUploadCarPhotoAcceptsEachFormatFR35Names(t *testing.T) {
	for name, data := range map[string][]byte{"png": pngBytes, "jpeg": jpegBytes, "webp": webpBytes, "heic": heicBytes} {
		t.Run(name, func(t *testing.T) {
			carId := uuid.New()
			service := &photoFake{photo: domain.CarPhoto{Url: "https://signed.test/x", Source: "upload"}}

			recorder := uploadPhoto(t, service, carId.String(), part{"file", "car." + name, "image/" + name, data})

			require.Equal(t, http.StatusCreated, recorder.Code, recorder.Body.String())
			require.Equal(t, carId, service.carId, "the car comes from the path")
			require.Equal(t, data, service.received)
			require.JSONEq(t, `{"url":"https://signed.test/x","source":"upload","attribution":null}`, recorder.Body.String())
		})
	}
}

// Content decides, not the name or the declared type.
func TestUploadCarPhotoJudgesByContentNotByName(t *testing.T) {
	t.Run("a PNG named .jpg is accepted", func(t *testing.T) {
		service := &photoFake{}

		recorder := uploadPhoto(t, service, uuid.NewString(), part{"file", "photo.jpg", "image/jpeg", pngBytes})

		require.Equal(t, http.StatusCreated, recorder.Code)
		require.Equal(t, 1, service.calls)
	})

	for name, data := range map[string][]byte{"an SVG": svgBytes, "a PDF": pdfBytes, "an HTML page": htmlBytes} {
		t.Run(name+" named .jpg is refused", func(t *testing.T) {
			service := &photoFake{}

			recorder := uploadPhoto(t, service, uuid.NewString(), part{"file", "photo.jpg", "image/jpeg", data})

			require.Equal(t, http.StatusUnprocessableEntity, recorder.Code)
			problem := photoProblem(t, recorder)
			require.Equal(t, "/problems/invalid-file", problem.Type)
			require.Equal(t, []rest.InvalidParam{{Name: "file", Reason: "This file must be a JPEG, PNG, WebP or HEIC image"}}, problem.InvalidParams)
			require.Zero(t, service.calls, "refused before the service")
		})
	}
}

func TestUploadCarPhotoAcceptsExactlyTenMegabytes(t *testing.T) {
	data := append(append([]byte{}, pngBytes...), make([]byte, domain.MaxPhotoBytes-len(pngBytes))...)
	service := &photoFake{}

	recorder := uploadPhoto(t, service, uuid.NewString(), part{"file", "big.png", "image/png", data})

	require.Equal(t, http.StatusCreated, recorder.Code)
	require.Len(t, service.received, domain.MaxPhotoBytes)
}

func TestUploadCarPhotoRefusesOneByteOverTenMegabytes(t *testing.T) {
	data := append(append([]byte{}, pngBytes...), make([]byte, domain.MaxPhotoBytes-len(pngBytes)+1)...)
	service := &photoFake{}

	recorder := uploadPhoto(t, service, uuid.NewString(), part{"file", "big.png", "image/png", data})

	require.Equal(t, http.StatusUnprocessableEntity, recorder.Code)
	require.Equal(t, "This file must be at most 10MB", photoProblem(t, recorder).InvalidParams[0].Reason)
	require.Zero(t, service.calls)
}

func TestUploadCarPhotoRefusesABodyWithoutAFile(t *testing.T) {
	service := &photoFake{}

	recorder := uploadPhoto(t, service, uuid.NewString(), part{"caption", "", "text/plain", []byte("my car")})

	require.Equal(t, http.StatusUnprocessableEntity, recorder.Code)
	require.Equal(t, []rest.InvalidParam{{Name: "file", Reason: "This field is required"}}, photoProblem(t, recorder).InvalidParams)
	require.Zero(t, service.calls)
}

func TestUploadCarPhotoRefusesAnEmptyFile(t *testing.T) {
	service := &photoFake{}

	recorder := uploadPhoto(t, service, uuid.NewString(), part{"file", "empty.png", "image/png", nil})

	require.Equal(t, http.StatusUnprocessableEntity, recorder.Code)
	require.Equal(t, "This file is empty", photoProblem(t, recorder).InvalidParams[0].Reason)
}

// Other fields alongside the file are skipped rather than refused.
func TestUploadCarPhotoFindsTheFileAmongOtherFields(t *testing.T) {
	service := &photoFake{}

	recorder := uploadPhoto(t, service, uuid.NewString(),
		part{"caption", "", "text/plain", []byte("my car")},
		part{"file", "car.png", "image/png", pngBytes},
	)

	require.Equal(t, http.StatusCreated, recorder.Code)
	require.Equal(t, pngBytes, service.received)
}

func TestUploadCarPhotoRefusesABodyThatIsNotMultipart(t *testing.T) {
	service := &photoFake{}

	recorder := send(t, service, uuid.NewString(), "application/json", bytes.NewBufferString(`{"file":"x"}`))

	require.Equal(t, http.StatusBadRequest, recorder.Code)
	require.Equal(t, "/problems/malformed-body", photoProblem(t, recorder).Type)
	require.Zero(t, service.calls)
}

func TestUploadCarPhotoAnswersAnUnreachableCarAsNotFound(t *testing.T) {
	t.Run("malformed id", func(t *testing.T) {
		service := &photoFake{}
		recorder := uploadPhoto(t, service, "not-a-uuid", part{"file", "car.png", "image/png", pngBytes})

		require.Equal(t, http.StatusNotFound, recorder.Code)
		require.Zero(t, service.calls)
	})

	t.Run("not the caller's car", func(t *testing.T) {
		service := &photoFake{err: domain.ErrCarNotFound}
		recorder := uploadPhoto(t, service, uuid.NewString(), part{"file", "car.png", "image/png", pngBytes})

		require.Equal(t, http.StatusNotFound, recorder.Code)
		require.Equal(t, "No car with that id.", photoProblem(t, recorder).Detail)
	})
}

func TestUploadCarPhotoWithoutMediaStorageIsUnavailable(t *testing.T) {
	service := &photoFake{err: domain.ErrMediaUnavailable}

	recorder := uploadPhoto(t, service, uuid.NewString(), part{"file", "car.png", "image/png", pngBytes})

	require.Equal(t, http.StatusServiceUnavailable, recorder.Code)
}

// A storage failure is ours, and the reply names nothing about it.
func TestUploadCarPhotoHidesStorageFailures(t *testing.T) {
	service := &photoFake{err: errors.New("cloudinary: invalid signature for api_key 123456789")}

	recorder := uploadPhoto(t, service, uuid.NewString(), part{"file", "car.png", "image/png", pngBytes})

	require.Equal(t, http.StatusBadGateway, recorder.Code)
	body := recorder.Body.String()
	require.False(t, strings.Contains(body, "cloudinary") || strings.Contains(body, "123456789"), body)
}
