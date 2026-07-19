// apps/api/internal/config/config.go

package config

import (
	"fmt"
	"os"
	"strings"
)

type Config struct {
	// Server
	Port    string
	Version string
	Env     string

	// Database
	DatabaseURL string

	// Redis
	RedisURL string

	// Auth
	JWTSecret string

	// External services
	CloudinaryURL string
	ClaudeAPIKey  string
	OpenAIAPIKey  string
	ResendAPIKey  string
	ChannelToken  string
}

func Load() (*Config, error) {
	cfg := &Config{
		Port:    getEnv("PORT", "8080"),
		Version: getEnv("VERSION", "0.1.0"),
		Env:     getEnv("RAILWAY_ENVIRONMENT", "development"),
	}

	// Required variables — missing any = refuse to start
	required := map[string]*string{
		"DATABASE_URL":   &cfg.DatabaseURL,
		"REDIS_URL":      &cfg.RedisURL,
		"JWT_SECRET":     &cfg.JWTSecret,
		"CLOUDINARY_URL": &cfg.CloudinaryURL,
		"CLAUDE_API_KEY": &cfg.ClaudeAPIKey,
		"OPENAI_API_KEY": &cfg.OpenAIAPIKey,
		"RESEND_API_KEY": &cfg.ResendAPIKey,
		"CHANNEL_TOKEN":  &cfg.ChannelToken,
	}

	var missing []string
	for key, dest := range required {
		val := os.Getenv(key)
		if val == "" {
			missing = append(missing, key)
			continue
		}
		*dest = val
	}

	if len(missing) > 0 {
		return nil, fmt.Errorf(
			"missing required environment variables: %s",
			strings.Join(missing, ", "),
		)
	}

	// Strength checks
	if len(cfg.JWTSecret) < 32 {
		return nil, fmt.Errorf(
			"JWT_SECRET must be at least 32 characters",
		)
	}

	return cfg, nil
}

func getEnv(key, fallback string) string {
	if val := os.Getenv(key); val != "" {
		return val
	}
	return fallback
}
