package ports

import (
	"context"

	"github.com/google/uuid"

	"github.com/willikay11/wrench/api/internal/core/domain"
)

// Driving
type CatalogueService interface {
	SearchMakes(ctx context.Context, search domain.CatalogueSearch) ([]domain.VehicleMake, error)
	SearchModels(ctx context.Context, makeId uuid.UUID, search domain.CatalogueSearch) ([]domain.VehicleModel, error)
	// ListGenerations returns a model's generations, only those covering year
	// when one is given.
	ListGenerations(ctx context.Context, modelId uuid.UUID, year *int) ([]domain.VehicleGeneration, error)
}

// Driven - core calls out through these.
type CatalogueRepository interface {
	SearchMakes(ctx context.Context, search domain.CatalogueSearch) ([]domain.VehicleMake, error)
	SearchModels(ctx context.Context, makeId uuid.UUID, search domain.CatalogueSearch) ([]domain.VehicleModel, error)
	ListGenerations(ctx context.Context, modelId uuid.UUID, year *int) ([]domain.VehicleGeneration, error)
}

// ImageLocator turns a stored image reference into a URL a browser can load.
// It reports false when it cannot build one, so the caller can leave the image
// out rather than send a broken link.
type ImageLocator interface {
	PublicURL(publicId string) (string, bool)
}
