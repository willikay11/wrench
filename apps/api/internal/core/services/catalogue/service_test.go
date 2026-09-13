package catalogue_test

import (
	"context"
	"errors"
	"testing"

	"github.com/google/uuid"
	"github.com/stretchr/testify/require"

	"github.com/willikay11/wrench/api/internal/core/domain"
	"github.com/willikay11/wrench/api/internal/core/services/catalogue"
)

type fakeRepo struct {
	generations []domain.VehicleGeneration
	err         error
}

func (f *fakeRepo) SearchMakes(context.Context, domain.CatalogueSearch) ([]domain.VehicleMake, error) {
	return nil, f.err
}

func (f *fakeRepo) SearchModels(context.Context, uuid.UUID, domain.CatalogueSearch) ([]domain.VehicleModel, error) {
	return nil, f.err
}

func (f *fakeRepo) ListGenerations(context.Context, uuid.UUID, *int) ([]domain.VehicleGeneration, error) {
	return f.generations, f.err
}

type fakeImages struct {
	configured bool
	asked      []string
}

func (f *fakeImages) PublicURL(publicId string) (string, bool) {
	f.asked = append(f.asked, publicId)
	if !f.configured {
		return "", false
	}
	return "https://images.test/" + publicId, true
}

func withImage(image *domain.CatalogueImage) []domain.VehicleGeneration {
	return []domain.VehicleGeneration{{Id: uuid.New(), StartYear: 2002, BodyStyle: "coupe", Image: image}}
}

func attributed() *domain.CatalogueImage {
	return &domain.CatalogueImage{
		PublicId:    "wrench/catalogue/z33",
		Attribution: "Photo by Someone",
		License:     "CC BY-SA 4.0",
		SourceUrl:   "https://commons.example/z33",
	}
}

func TestListGenerationsBuildsTheImageURLWithItsAttribution(t *testing.T) {
	images := &fakeImages{configured: true}
	svc := catalogue.NewService(&fakeRepo{generations: withImage(attributed())}, images)

	got, err := svc.ListGenerations(t.Context(), uuid.New(), nil)

	require.NoError(t, err)
	require.NotNil(t, got[0].Image)
	require.Equal(t, "https://images.test/wrench/catalogue/z33", got[0].Image.Url)
	// The credit travels with the URL, never separately from it.
	require.Equal(t, "Photo by Someone", got[0].Image.Attribution)
	require.Equal(t, "CC BY-SA 4.0", got[0].Image.License)
}

func TestListGenerationsLeavesOutAnImageWhoseURLCannotBeBuilt(t *testing.T) {
	svc := catalogue.NewService(&fakeRepo{generations: withImage(attributed())}, &fakeImages{configured: false})

	got, err := svc.ListGenerations(t.Context(), uuid.New(), nil)

	require.NoError(t, err)
	require.Nil(t, got[0].Image, "a broken link is worse than no image")
}

func TestListGenerationsLeavesOutAnImageWithoutAttribution(t *testing.T) {
	for name, image := range map[string]*domain.CatalogueImage{
		"no attribution": {PublicId: "x", License: "CC BY 4.0", SourceUrl: "https://s"},
		"no licence":     {PublicId: "x", Attribution: "Someone", SourceUrl: "https://s"},
	} {
		t.Run(name, func(t *testing.T) {
			images := &fakeImages{configured: true}
			svc := catalogue.NewService(&fakeRepo{generations: withImage(image)}, images)

			got, err := svc.ListGenerations(t.Context(), uuid.New(), nil)

			require.NoError(t, err)
			require.Nil(t, got[0].Image)
			require.Empty(t, images.asked, "an uncredited image must not even be located")
		})
	}
}

func TestListGenerationsWithNoLocatorLeavesImagesOut(t *testing.T) {
	svc := catalogue.NewService(&fakeRepo{generations: withImage(attributed())}, nil)

	got, err := svc.ListGenerations(t.Context(), uuid.New(), nil)

	require.NoError(t, err)
	require.Nil(t, got[0].Image)
}

func TestListGenerationsForwardsRepositoryErrors(t *testing.T) {
	svc := catalogue.NewService(&fakeRepo{err: domain.ErrModelNotFound}, &fakeImages{configured: true})

	_, err := svc.ListGenerations(t.Context(), uuid.New(), nil)

	require.ErrorIs(t, err, domain.ErrModelNotFound)
}

func TestSearchForwardsRepositoryErrors(t *testing.T) {
	failure := errors.New("boom")
	svc := catalogue.NewService(&fakeRepo{err: failure}, nil)

	_, err := svc.SearchMakes(t.Context(), domain.CatalogueSearch{Limit: 20})
	require.ErrorIs(t, err, failure)

	_, err = svc.SearchModels(t.Context(), uuid.New(), domain.CatalogueSearch{Limit: 20})
	require.ErrorIs(t, err, failure)
}
