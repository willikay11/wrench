package car

import (
	"context"

	"github.com/google/uuid"

	"github.com/willikay11/wrench/api/internal/core/domain"
	"github.com/willikay11/wrench/api/internal/core/ports"
)

type service struct {
	carRepo   ports.CarRepository
	catalogue ports.CatalogueRepository
	txManager ports.TxManager
}

func NewService(
	carRepo ports.CarRepository,
	catalogue ports.CatalogueRepository,
	txManager ports.TxManager) *service {
	return &service{
		carRepo:   carRepo,
		catalogue: catalogue,
		txManager: txManager,
	}
}

// CreateCar saves a car, checking any catalogue link before anything is
// written. A car with no link is saved exactly as before.
func (s *service) CreateCar(ctx context.Context, car domain.Car) (domain.Car, error) {
	if car.GenerationId != nil {
		if err := s.checkLink(ctx, *car.GenerationId, car.Make, car.Model, car.Year); err != nil {
			return domain.Car{}, err
		}
	}

	car, err := s.carRepo.Save(ctx, car)

	if err != nil {
		return domain.Car{}, err
	}
	return car, nil
}

// UpdateCar applies a partial update, keeping a linked car in agreement with
// its generation.
//
// A link depends on the car's make, model and year, and a PATCH may name only
// some of them, so the check needs the stored car to fill in the rest. The read,
// the check and the write happen in one transaction with the row locked, so a
// concurrent edit cannot change the car between the check and the write.
//
// An update that cannot affect a link — notes, engine, usage — skips all of it.
func (s *service) UpdateCar(ctx context.Context, updateCar domain.UpdateCar) (domain.Car, error) {
	if !touchesLink(updateCar) {
		car, err := s.carRepo.Update(ctx, updateCar)

		if err != nil {
			return domain.Car{}, err
		}
		return car, nil
	}

	var car domain.Car

	err := s.txManager.WithinTransaction(ctx, func(ctx context.Context) error {
		// Ownership first. A car that is not the caller's is not found, and the
		// catalogue is never consulted on its behalf — nothing about the car,
		// its link or the generation leaks through the error that comes back.
		current, err := s.carRepo.GetForUpdate(ctx, updateCar.Id, updateCar.UserId)
		if err != nil {
			return err
		}

		link := current.GenerationId
		if updateCar.GenerationId.Sent {
			link = updateCar.GenerationId.Value
		}

		// Checked against the car as it will be after this update: the new
		// value where the body gave one, the stored value where it did not.
		if link != nil {
			err := s.checkLink(ctx, *link,
				valueOr(updateCar.Make, current.Make),
				valueOr(updateCar.Model, current.Model),
				valueOr(updateCar.Year, current.Year),
			)
			if err != nil {
				return err
			}
		}

		car, err = s.carRepo.Update(ctx, updateCar)
		return err
	})

	if err != nil {
		return domain.Car{}, err
	}
	return car, nil
}

func (s *service) ListCars(ctx context.Context, query domain.CarQuery) (domain.CarPage, error) {
	page, err := s.carRepo.List(ctx, query)

	if err != nil {
		return domain.CarPage{}, err
	}
	return page, nil
}

// touchesLink reports whether an update could leave a car disagreeing with its
// generation: by naming a link, or by changing a field a link depends on.
func touchesLink(update domain.UpdateCar) bool {
	return update.GenerationId.Sent || update.Make != nil || update.Model != nil || update.Year != nil
}

// checkLink refuses a link to a generation that does not exist, or that the
// car's make, model or year disagrees with.
func (s *service) checkLink(ctx context.Context, generationId uuid.UUID, carMake, carModel string, year int) error {
	match, err := s.catalogue.FindGeneration(ctx, generationId)
	if err != nil {
		return err
	}

	if fields := match.Disagreements(carMake, carModel, year); len(fields) > 0 {
		return &domain.GenerationMismatchError{
			Fields:    fields,
			StartYear: match.Generation.StartYear,
			EndYear:   match.Generation.EndYear,
		}
	}

	return nil
}

func valueOr[T any](value *T, fallback T) T {
	if value == nil {
		return fallback
	}
	return *value
}
