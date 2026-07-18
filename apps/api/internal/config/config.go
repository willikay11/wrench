package config

import (
	"fmt"
	"os"
	"path/filepath"

	"github.com/joho/godotenv"
)

type Config struct {
	Port string
}

func LoadConfig() (*Config, error) {
	// Load environment variables from .env file if it exists
	envPath := filepath.Join(".", ".env")
	if _, err := os.Stat(envPath); err == nil {
		if err := godotenv.Load(envPath); err != nil {
			return nil, fmt.Errorf("error loading .env file: %v", err)
		}
	}

	port := os.Getenv("PORT")
	if port == "" {
		port = "8080" // Default port if not specified
	}

	return &Config{
		Port: port,
	}, nil
}
