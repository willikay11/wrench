package redis

import (
	"context"

	"github.com/redis/go-redis/v9"
)

func Redis(ctx context.Context, redisUrl string) *redis.Client {
	rdb := redis.NewClient(&redis.Options{
		Addr:     redisUrl,
		Password: "",
		DB:       0,
	})

	defer rdb.Close()

	return rdb
}
