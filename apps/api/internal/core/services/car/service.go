package car

import (
	"context"
	"fmt"

	"github.com/google/uuid"
	"github.com/rs/zerolog/log"

	"github.com/willikay11/wrench/api/internal/core/domain"
	"github.com/willikay11/wrench/api/internal/core/ports"
)

type service struct {
	carRepo   ports.CarRepository
	catalogue ports.CatalogueRepository
	media     ports.MediaStore
	images    ports.ImageLocator
	txManager ports.TxManager
}

// NewService builds the car service. media and images may be nil when media
// storage is not configured: cars are then shown with no photo, and uploads
// are refused as unavailable rather than failing some other way.
func NewService(
	carRepo ports.CarRepository,
	catalogue ports.CatalogueRepository,
	media ports.MediaStore,
	images ports.ImageLocator,
	txManager ports.TxManager) *service {
	return &service{
		carRepo:   carRepo,
		catalogue: catalogue,
		media:     media,
		images:    images,
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

	s.resolvePhoto(&car)
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

		s.resolvePhoto(&car)
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

	s.resolvePhoto(&car)
	return car, nil
}

func (s *service) ListCars(ctx context.Context, query domain.CarQuery) (domain.CarPage, error) {
	page, err := s.carRepo.List(ctx, query)

	if err != nil {
		return domain.CarPage{}, err
	}

	for i := range page.Cars {
		s.resolvePhoto(&page.Cars[i])
	}
	return page, nil
}

// SetCarPhoto stores an image as the car's primary photo.
//
// The order is what keeps it safe:
//  1. Ownership is checked before a byte is sent to media storage, so nothing
//     is ever uploaded against someone else's car.
//  2. The image is uploaded.
//  3. The record is written in a transaction that re-checks ownership with the
//     row locked, so a car deleted mid-upload is caught, and two concurrent
//     uploads cannot both become the primary photo.
//  4. If the record cannot be written, the new asset is deleted — no image is
//     left in storage that nothing points at.
//  5. Once the record has committed, the replaced asset is deleted, best-effort.
func (s *service) SetCarPhoto(ctx context.Context, carId, userId uuid.UUID, image []byte) (domain.CarPhoto, error) {
	if s.media == nil {
		return domain.CarPhoto{}, domain.ErrMediaUnavailable
	}

	if _, err := s.carRepo.GetForUpdate(ctx, carId, userId); err != nil {
		return domain.CarPhoto{}, err
	}

	stored, err := s.media.UploadCarPhoto(ctx, carId, image)
	if err != nil {
		return domain.CarPhoto{}, fmt.Errorf("store car photo: %w", err)
	}

	var previous *string

	err = s.txManager.WithinTransaction(ctx, func(ctx context.Context) error {
		if _, err := s.carRepo.GetForUpdate(ctx, carId, userId); err != nil {
			return err
		}

		var err error
		previous, err = s.carRepo.SetPrimaryPhoto(ctx, carId, stored)
		return err
	})
	if err != nil {
		// Detached from the request: a cancelled request is exactly the case
		// where this cleanup must still run.
		if cleanupErr := s.media.Delete(context.WithoutCancel(ctx), stored.PublicId); cleanupErr != nil {
			log.Error().Err(cleanupErr).Str("carId", carId.String()).
				Msg("Could not remove a photo whose record failed; it is orphaned in media storage")
		}
		return domain.CarPhoto{}, err
	}

	if previous != nil {
		if err := s.media.Delete(context.WithoutCancel(ctx), *previous); err != nil {
			// The new photo is in place; the old asset only costs storage. It is
			// worth knowing about, not worth failing the request for.
			log.Warn().Err(err).Str("carId", carId.String()).
				Msg("Could not delete a replaced car photo; it is orphaned in media storage")
		}
	}

	url, err := s.media.SignedURL(stored.PublicId)
	if err != nil {
		return domain.CarPhoto{}, fmt.Errorf("sign car photo: %w", err)
	}

	return domain.CarPhoto{Url: url, Source: domain.PhotoSourceUpload}, nil
}

// resolvePhoto sets the image a car is shown with, in one order: the owner's
// upload, then the linked generation's catalogue image, then none — which the
// client shows as its branded placeholder (ADR-010).
//
// It always overwrites Photo, so a value that arrived in a request body never
// survives to the response. A catalogue image without its attribution and
// licence is skipped rather than shown uncredited.
func (s *service) resolvePhoto(car *domain.Car) {
	car.Photo = nil

	if car.PhotoPublicId != nil && s.media != nil {
		if url, err := s.media.SignedURL(*car.PhotoPublicId); err == nil {
			car.Photo = &domain.CarPhoto{Url: url, Source: domain.PhotoSourceUpload}
			return
		}
	}

	image := car.CatalogueImage
	if image == nil || image.Attribution == "" || image.License == "" || s.images == nil {
		return
	}

	if url, ok := s.images.PublicURL(image.PublicId); ok {
		attribution := image.Attribution
		car.Photo = &domain.CarPhoto{Url: url, Source: domain.PhotoSourceCatalogue, Attribution: &attribution}
	}
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
