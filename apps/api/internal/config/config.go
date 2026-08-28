// apps/api/internal/config/config.go

package config

import (
	"fmt"
	"os"
	"strconv"
	"strings"
	"time"
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

	// Email
	FromEmail string

	// Email dispatch worker
	EmailPollInterval time.Duration
	EmailTickTimeout  time.Duration
	EmailBatchSize    int
	EmailStaleAfter   time.Duration

	// GOOGLE OAUTH2
	GoogleClientId     string
	GoogleClientSecret string
}

func Load() (*Config, error) {
	var err error

	cfg := &Config{
		Port:    getEnv("PORT", "8080"),
		Version: getEnv("VERSION", "0.1.0"),
		Env:     getEnv("RAILWAY_ENVIRONMENT", "development"),
	}

	// Required variables — missing any = refuse to start
	required := map[string]*string{
		"DATABASE_URL":         &cfg.DatabaseURL,
		"REDIS_URL":            &cfg.RedisURL,
		"JWT_SECRET":           &cfg.JWTSecret,
		"CLOUDINARY_URL":       &cfg.CloudinaryURL,
		"CLAUDE_API_KEY":       &cfg.ClaudeAPIKey,
		"OPENAI_API_KEY":       &cfg.OpenAIAPIKey,
		"RESEND_API_KEY":       &cfg.ResendAPIKey,
		"CHANNEL_TOKEN":        &cfg.ChannelToken,
		"FROM_EMAIL":           &cfg.FromEmail,
		"GOOGLE_CLIENT_ID":     &cfg.GoogleClientId,
		"GOOGLE_CLIENT_SECRET": &cfg.GoogleClientSecret,
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

	// Optional tunables — sensible defaults, but a malformed value is a typo
	// worth failing on rather than silently ignoring.
	cfg.EmailPollInterval, err = getEnvDuration("EMAIL_POLL_INTERVAL", 30*time.Second)
	if err != nil {
		return nil, err
	}

	cfg.EmailTickTimeout, err = getEnvDuration("EMAIL_TICK_TIMEOUT", 60*time.Second)
	if err != nil {
		return nil, err
	}

	cfg.EmailBatchSize, err = getEnvInt("EMAIL_BATCH_SIZE", 10)
	if err != nil {
		return nil, err
	}

	cfg.EmailStaleAfter, err = getEnvDuration("EMAIL_STALE_AFTER", 5*time.Minute)
	if err != nil {
		return nil, err
	}

	// A pass can hold rows in 'processing' for up to EMAIL_TICK_TIMEOUT, so
	// reclaiming sooner than that would hand a live worker's rows to another
	// instance and send the email twice.
	if cfg.EmailStaleAfter <= cfg.EmailTickTimeout {
		return nil, fmt.Errorf(
			"EMAIL_STALE_AFTER (%s) must be greater than EMAIL_TICK_TIMEOUT (%s)",
			cfg.EmailStaleAfter, cfg.EmailTickTimeout,
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

func getEnvDuration(key string, fallback time.Duration) (time.Duration, error) {
	val := os.Getenv(key)
	if val == "" {
		return fallback, nil
	}

	d, err := time.ParseDuration(val)
	if err != nil {
		return 0, fmt.Errorf("%s must be a duration such as 30s or 2m: %w", key, err)
	}
	if d <= 0 {
		return 0, fmt.Errorf("%s must be greater than zero", key)
	}
	return d, nil
}

func getEnvInt(key string, fallback int) (int, error) {
	val := os.Getenv(key)
	if val == "" {
		return fallback, nil
	}

	n, err := strconv.Atoi(val)
	if err != nil {
		return 0, fmt.Errorf("%s must be an integer: %w", key, err)
	}
	if n <= 0 {
		return 0, fmt.Errorf("%s must be greater than zero", key)
	}
	return n, nil
}
