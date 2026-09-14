package catalogue

import (
	"context"

	"github.com/google/uuid"

	"github.com/willikay11/wrench/api/internal/core/domain"
	"github.com/willikay11/wrench/api/internal/core/ports"
)

type service struct {
	repo   ports.CatalogueRepository
	images ports.ImageLocator
}

func NewService(repo ports.CatalogueRepository, images ports.ImageLocator) *service {
	return &service{repo: repo, images: images}
}

func (s *service) SearchMakes(ctx context.Context, search domain.CatalogueSearch) ([]domain.VehicleMake, error) {
	return s.repo.SearchMakes(ctx, search)
}

func (s *service) SearchModels(ctx context.Context, makeId uuid.UUID, search domain.CatalogueSearch) ([]domain.VehicleModel, error) {
	return s.repo.SearchModels(ctx, makeId, search)
}

func (s *service) ListGenerations(ctx context.Context, modelId uuid.UUID, year *int) ([]domain.VehicleGeneration, error) {
	generations, err := s.repo.ListGenerations(ctx, modelId, year)
	if err != nil {
		return nil, err
	}

	for i := range generations {
		generations[i].Image = s.locate(generations[i].Image)
	}

	return generations, nil
}

// locate resolves a stored image to one a client can load, or drops it.
//
// Both ways of dropping are deliberate. An image whose URL cannot be built is
// left out rather than sent as a broken link, and one missing its attribution
// or licence is left out rather than shown uncredited — the database refuses
// such a row, and this is the second line behind it.
func (s *service) locate(image *domain.CatalogueImage) *domain.CatalogueImage {
	if image == nil || image.PublicId == "" || image.Attribution == "" || image.License == "" {
		return nil
	}
	if s.images == nil {
		return nil
	}

	url, ok := s.images.PublicURL(image.PublicId)
	if !ok {
		return nil
	}

	located := *image
	located.Url = url

	return &located
}
