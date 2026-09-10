package ports

import (
	"context"

	"github.com/willikay11/wrench/api/internal/core/domain"
)

// Driving
type CarService interface {
	CreateCar(ctx context.Context, car domain.Car) (domain.Car, error)
	UpdateCar(ctx context.Context, updateCar domain.UpdateCar) (domain.Car, error)
	ListCars(ctx context.Context, query domain.CarQuery) (domain.CarPage, error)
}

// Driven - core calls out through this.
type CarRepository interface {
	Save(ctx context.Context, car domain.Car) (domain.Car, error)
	Update(ctx context.Context, car domain.UpdateCar) (domain.Car, error)
	List(ctx context.Context, query domain.CarQuery) (domain.CarPage, error)
}
