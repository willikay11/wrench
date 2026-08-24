package cache

import (
	"context"
	"fmt"

	"github.com/redis/go-redis/v9"
)

func Redis(ctx context.Context, redisUrl string) (*redis.Client, error) {
	opt, err := redis.ParseURL(redisUrl)

	fmt.Printf(opt.Addr, opt.Password)
	if err != nil {
		return nil, err
	}

	rdb := redis.NewClient(opt)
	if err := rdb.Ping(ctx).Err(); err != nil {
		rdb.Close()
		return nil, err
	}

	return rdb, nil
}
