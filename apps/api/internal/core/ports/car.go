package ports

import (
	"context"

	"github.com/willikay11/wrench/api/internal/core/domain"
)

// Driving
type CarService interface {
	CreateCar(ctx context.Context, car domain.Car) (domain.Car, error)
}

// Driven - core calls out through this.
type CarRepository interface {
	Save(ctx context.Context, car domain.Car) (domain.Car, error)
}
