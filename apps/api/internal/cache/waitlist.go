package cache

import (
	"context"
	"errors"
	"fmt"
	"strconv"
	"time"

	"github.com/redis/go-redis/v9"
	"github.com/willikay11/wrench/api/internal/core/domain"
)

const waitlistKey = "waitlist:count"

type waitlistRedis struct {
	rdb *redis.Client
}

func NewWaitlistRedis(rdb *redis.Client) *waitlistRedis {
	return &waitlistRedis{rdb: rdb}
}

func (r *waitlistRedis) Count(ctx context.Context) (int, error) {
	val, err := r.rdb.Get(ctx, waitlistKey).Result()

	if errors.Is(err, redis.Nil) {
		return 0, domain.ErrCacheMiss // exported sentinel in this package
	}
	if err != nil {
		return 0, fmt.Errorf("query count waitlist: %w", err)
	}

	count, err := strconv.Atoi(val)

	if err != nil {
		return 0, fmt.Errorf("unable to convert count string: %w", err)
	}

	return count, nil
}

func (r *waitlistRedis) IncreaseCount(ctx context.Context, currentCount int) error {
	_, err := r.rdb.Set(ctx, waitlistKey, currentCount, 5*time.Minute).Result()

	if err != nil {
		return fmt.Errorf("save waitlist count: %w", err)
	}

	return nil
}
