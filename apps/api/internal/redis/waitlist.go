package redis

import (
	"context"
	"fmt"
	"strconv"

	"github.com/redis/go-redis/v9"
)

const waitlistKey = "wait_list_count"

type waitlistRedis struct {
	rdb *redis.Client
}

func NewWaitlistRedis(rdb *redis.Client) *waitlistRedis {
	return &waitlistRedis{rdb: rdb}
}

func (r *waitlistRedis) Count(ctx context.Context) (int, error) {
	val, err := r.rdb.Get(ctx, waitlistKey).Result()

	count, err := strconv.Atoi(val)

	if err != nil {
		return 0, fmt.Errorf("query count waitlist: %w", err)
	}

	return count, nil
}
