package main

import (
	"fmt"

	"github.com/jackc/pgx/v5/pgxpool"
)

func main() {
	urls := []string{
		"postgresql://u:p@host.neon.tech/neondb?sslmode=require&channel_binding=require",
		"postgresql://u:p@host.neon.tech/neondb?sslmode=require",
	}
	for _, u := range urls {
		_, err := pgxpool.ParseConfig(u)
		if err != nil {
			fmt.Printf("FAIL  %s\n      -> %v\n", u, err)
			continue
		}
		fmt.Printf("OK    %s\n", u)
	}
}
