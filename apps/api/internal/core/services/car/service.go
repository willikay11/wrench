package car

import (
	"context"

	"github.com/willikay11/wrench/api/internal/core/domain"
	"github.com/willikay11/wrench/api/internal/core/ports"
)

type service struct {
	carRepo   ports.CarRepository
	txManager ports.TxManager
}

func NewService(
	carRepo ports.CarRepository,
	txManager ports.TxManager) *service {
	return &service{
		carRepo:   carRepo,
		txManager: txManager,
	}
}

func (s *service) CreateCar(ctx context.Context, car domain.Car) (domain.Car, error) {
	car, err := s.carRepo.Save(ctx, car)

	if err != nil {
		return domain.Car{}, err
	}
	return car, nil
}
