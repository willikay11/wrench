package car_test

import (
	"context"
	"errors"
	"testing"

	"github.com/google/uuid"
	"github.com/stretchr/testify/require"

	"github.com/willikay11/wrench/api/internal/core/domain"
	"github.com/willikay11/wrench/api/internal/core/services/car"
)

/*
A car's photo has two halves: storing one, which must never upload against
someone else's car or leave an asset nothing points at, and showing one, which
must resolve the same way everywhere — the owner's upload, then the catalogue
image with its credit, then nothing.
*/

type fakeMedia struct {
	uploads   int
	uploadErr error
	stored    domain.StoredImage
	deleted   []string
	signErr   error
}

func (m *fakeMedia) UploadCarPhoto(context.Context, uuid.UUID, []byte) (domain.StoredImage, error) {
	m.uploads++
	return m.stored, m.uploadErr
}

func (m *fakeMedia) SignedURL(publicId string) (string, error) {
	if m.signErr != nil {
		return "", m.signErr
	}
	return "https://signed.test/" + publicId, nil
}

func (m *fakeMedia) Delete(_ context.Context, publicId string) error {
	m.deleted = append(m.deleted, publicId)
	return nil
}

type fakeLocator struct{}

func (fakeLocator) PublicURL(publicId string) (string, bool) {
	return "https://public.test/" + publicId, true
}

// photoRepo is a car repository whose photo record can be made to fail.
type photoRepo struct {
	car      domain.Car
	getErr   error
	gets     int
	setErr   error
	setCalls int
	previous *string
}

func (r *photoRepo) Save(context.Context, domain.Car) (domain.Car, error) { return r.car, nil }
func (r *photoRepo) Update(context.Context, domain.UpdateCar) (domain.Car, error) {
	return r.car, nil
}
func (r *photoRepo) List(context.Context, domain.CarQuery) (domain.CarPage, error) {
	return domain.CarPage{Cars: []domain.Car{r.car}}, nil
}
func (r *photoRepo) GetForUpdate(context.Context, uuid.UUID, uuid.UUID) (domain.Car, error) {
	r.gets++
	return r.car, r.getErr
}
func (r *photoRepo) SetPrimaryPhoto(context.Context, uuid.UUID, domain.StoredImage) (*string, error) {
	r.setCalls++
	return r.previous, r.setErr
}

// The other repositories only need to satisfy the port.
func (m *mockCarRepo) SetPrimaryPhoto(context.Context, uuid.UUID, domain.StoredImage) (*string, error) {
	return nil, nil
}

func (r *linkRepo) SetPrimaryPhoto(context.Context, uuid.UUID, domain.StoredImage) (*string, error) {
	return nil, nil
}

func photoService(repo *photoRepo, media *fakeMedia) interface {
	SetCarPhoto(context.Context, uuid.UUID, uuid.UUID, []byte) (domain.CarPhoto, error)
	CreateCar(context.Context, domain.Car) (domain.Car, error)
	ListCars(context.Context, domain.CarQuery) (domain.CarPage, error)
} {
	if media == nil {
		return car.NewService(repo, &fakeCatalogue{}, nil, fakeLocator{}, &txRecorder{})
	}
	return car.NewService(repo, &fakeCatalogue{}, media, fakeLocator{}, &txRecorder{})
}

func TestSetCarPhotoOnSomeoneElsesCarUploadsNothing(t *testing.T) {
	media := &fakeMedia{}
	repo := &photoRepo{getErr: domain.ErrCarNotFound}

	_, err := photoService(repo, media).SetCarPhoto(t.Context(), uuid.New(), uuid.New(), []byte("png"))

	require.ErrorIs(t, err, domain.ErrCarNotFound)
	require.Zero(t, media.uploads, "not one byte may be sent against a car the caller does not own")
	require.Zero(t, repo.setCalls)
}

func TestSetCarPhotoWithoutMediaStorageIsUnavailable(t *testing.T) {
	repo := &photoRepo{}

	_, err := photoService(repo, nil).SetCarPhoto(t.Context(), uuid.New(), uuid.New(), []byte("png"))

	require.ErrorIs(t, err, domain.ErrMediaUnavailable)
}

func TestSetCarPhotoRecordsTheUploadAndReturnsASignedURL(t *testing.T) {
	media := &fakeMedia{stored: domain.StoredImage{PublicId: "wrench/cars/x/photo/new"}}
	repo := &photoRepo{}

	photo, err := photoService(repo, media).SetCarPhoto(t.Context(), uuid.New(), uuid.New(), []byte("png"))

	require.NoError(t, err)
	require.Equal(t, "https://signed.test/wrench/cars/x/photo/new", photo.Url)
	require.Equal(t, domain.PhotoSourceUpload, photo.Source)
	require.Nil(t, photo.Attribution, "the owner's own photo needs no credit")
	require.Equal(t, 1, repo.setCalls)
	require.Empty(t, media.deleted)
	// Once before uploading, and again inside the transaction.
	require.Equal(t, 2, repo.gets)
}

func TestSetCarPhotoDeletesThePhotoItReplaced(t *testing.T) {
	old := "wrench/cars/x/photo/old"
	media := &fakeMedia{stored: domain.StoredImage{PublicId: "wrench/cars/x/photo/new"}}
	repo := &photoRepo{previous: &old}

	_, err := photoService(repo, media).SetCarPhoto(t.Context(), uuid.New(), uuid.New(), []byte("png"))

	require.NoError(t, err)
	require.Equal(t, []string{old}, media.deleted)
}

// The asset exists and its record does not: remove the asset.
func TestSetCarPhotoRemovesTheUploadWhenItCannotBeRecorded(t *testing.T) {
	media := &fakeMedia{stored: domain.StoredImage{PublicId: "wrench/cars/x/photo/new"}}
	repo := &photoRepo{setErr: errors.New("connection reset")}

	_, err := photoService(repo, media).SetCarPhoto(t.Context(), uuid.New(), uuid.New(), []byte("png"))

	require.Error(t, err)
	require.Equal(t, []string{"wrench/cars/x/photo/new"}, media.deleted)
}

// A car deleted while its photo uploaded is caught inside the transaction, and
// the upload is cleaned away the same way.
func TestSetCarPhotoOnACarDeletedMidUploadCleansUp(t *testing.T) {
	media := &fakeMedia{stored: domain.StoredImage{PublicId: "wrench/cars/x/photo/new"}}
	repo := &photoRepo{}

	// The check before uploading passes; the one inside the transaction does not.
	calls := 0
	failing := &failSecondGet{photoRepo: repo, calls: &calls}
	_, err := car.NewService(failing, &fakeCatalogue{}, media, fakeLocator{}, &txRecorder{}).
		SetCarPhoto(t.Context(), uuid.New(), uuid.New(), []byte("png"))

	require.ErrorIs(t, err, domain.ErrCarNotFound)
	require.Equal(t, []string{"wrench/cars/x/photo/new"}, media.deleted)
	require.Zero(t, repo.setCalls)
}

type failSecondGet struct {
	*photoRepo
	calls *int
}

func (f *failSecondGet) GetForUpdate(ctx context.Context, id, userId uuid.UUID) (domain.Car, error) {
	*f.calls++
	if *f.calls > 1 {
		return domain.Car{}, domain.ErrCarNotFound
	}
	return f.photoRepo.car, nil
}

func TestSetCarPhotoRecordsNothingWhenTheUploadFails(t *testing.T) {
	media := &fakeMedia{uploadErr: errors.New("cloudinary: 500")}
	repo := &photoRepo{}

	_, err := photoService(repo, media).SetCarPhoto(t.Context(), uuid.New(), uuid.New(), []byte("png"))

	require.Error(t, err)
	require.Zero(t, repo.setCalls)
	require.Empty(t, media.deleted, "there is nothing to clean up")
}

func attributedImage() *domain.CatalogueImage {
	return &domain.CatalogueImage{
		PublicId: "wrench/catalogue/z33", Attribution: "Photo by Someone",
		License: "CC BY-SA 4.0", SourceUrl: "https://commons.example/z33",
	}
}

func TestCarPhotoResolvesUploadThenCatalogueThenNothing(t *testing.T) {
	upload := "wrench/cars/x/photo/mine"

	cases := []struct {
		name       string
		car        domain.Car
		wantUrl    string
		wantSource string
		wantCredit *string
	}{
		{
			name:       "the owner's upload wins over the catalogue",
			car:        domain.Car{PhotoPublicId: &upload, CatalogueImage: attributedImage()},
			wantUrl:    "https://signed.test/" + upload,
			wantSource: domain.PhotoSourceUpload,
		},
		{
			name:       "the catalogue image, credited, when there is no upload",
			car:        domain.Car{CatalogueImage: attributedImage()},
			wantUrl:    "https://public.test/wrench/catalogue/z33",
			wantSource: domain.PhotoSourceCatalogue,
			wantCredit: ptr("Photo by Someone"),
		},
		{
			name: "no photo at all, which the client shows as its placeholder",
			car:  domain.Car{},
		},
		{
			name: "a catalogue image without its licence is not shown",
			car:  domain.Car{CatalogueImage: &domain.CatalogueImage{PublicId: "x", Attribution: "Someone"}},
		},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			got, err := photoService(&photoRepo{car: tc.car}, &fakeMedia{}).CreateCar(t.Context(), domain.Car{})
			require.NoError(t, err)

			if tc.wantUrl == "" {
				require.Nil(t, got.Photo)
				return
			}
			require.NotNil(t, got.Photo)
			require.Equal(t, tc.wantUrl, got.Photo.Url)
			require.Equal(t, tc.wantSource, got.Photo.Source)
			require.Equal(t, tc.wantCredit, got.Photo.Attribution)
		})
	}
}

// A photo in a request body is never echoed back as the car's photo.
// echoRepo hands back the car it was given, as the real repository does for
// every field it does not read back from the database — which is exactly how a
// photo sent in a request body could otherwise reach the response.
type echoRepo struct{ photoRepo }

func (e *echoRepo) Save(_ context.Context, c domain.Car) (domain.Car, error) { return c, nil }

func TestCarPhotoIsAlwaysTheServersResolutionNotTheRequest(t *testing.T) {
	sent := domain.Car{Photo: &domain.CarPhoto{Url: "https://evil.example/x.jpg", Source: "upload"}}

	got, err := car.NewService(&echoRepo{}, &fakeCatalogue{}, &fakeMedia{}, fakeLocator{}, &txRecorder{}).
		CreateCar(t.Context(), sent)

	require.NoError(t, err)
	require.Nil(t, got.Photo, "a photo from the request body must never be echoed as the car's photo")
}

func TestListCarsResolvesEveryCarsPhoto(t *testing.T) {
	upload := "wrench/cars/x/photo/mine"

	page, err := photoService(&photoRepo{car: domain.Car{PhotoPublicId: &upload}}, &fakeMedia{}).
		ListCars(t.Context(), domain.CarQuery{Limit: 20})

	require.NoError(t, err)
	require.NotNil(t, page.Cars[0].Photo)
	require.Equal(t, domain.PhotoSourceUpload, page.Cars[0].Photo.Source)
}

// Media storage being unconfigured hides uploads, and still shows a credited
// catalogue image.
func TestCarPhotoWithoutMediaStorageFallsBackToTheCatalogue(t *testing.T) {
	upload := "wrench/cars/x/photo/mine"
	stored := domain.Car{PhotoPublicId: &upload, CatalogueImage: attributedImage()}

	got, err := photoService(&photoRepo{car: stored}, nil).CreateCar(t.Context(), domain.Car{})

	require.NoError(t, err)
	require.NotNil(t, got.Photo)
	require.Equal(t, domain.PhotoSourceCatalogue, got.Photo.Source)
}
