package ports

import (
	"context"

	"github.com/google/uuid"

	"github.com/willikay11/wrench/api/internal/core/domain"
)

// Driving
type CarService interface {
	CreateCar(ctx context.Context, car domain.Car) (domain.Car, error)
	UpdateCar(ctx context.Context, updateCar domain.UpdateCar) (domain.Car, error)
	ListCars(ctx context.Context, query domain.CarQuery) (domain.CarPage, error)
	// SetCarPhoto stores an image as the owner's car's primary photo, replacing
	// any previous one. ErrCarNotFound for a car that is not the caller's, with
	// nothing sent to media storage.
	SetCarPhoto(ctx context.Context, carId, userId uuid.UUID, image []byte) (domain.CarPhoto, error)
}

// Driven - core calls out through this.
type CarRepository interface {
	Save(ctx context.Context, car domain.Car) (domain.Car, error)
	Update(ctx context.Context, car domain.UpdateCar) (domain.Car, error)
	List(ctx context.Context, query domain.CarQuery) (domain.CarPage, error)
	// GetForUpdate reads one of the owner's cars and, inside a transaction,
	// holds it until the transaction ends. ErrCarNotFound when the car does not
	// exist or belongs to someone else — the two are not told apart.
	GetForUpdate(ctx context.Context, id, userId uuid.UUID) (domain.Car, error)
	// SetPrimaryPhoto records an image as the car's primary photo, removing the
	// previous record, and returns the previous image's public id so its asset
	// can be deleted. Must run inside a transaction.
	SetPrimaryPhoto(ctx context.Context, carId uuid.UUID, image domain.StoredImage) (*string, error)
}
