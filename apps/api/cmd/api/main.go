// apps/api/cmd/api/main.go

package main

import (
	"context"
	"fmt"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"
	"github.com/joho/godotenv"
	"github.com/rs/zerolog"
	"github.com/rs/zerolog/log"

	"github.com/resend/resend-go/v3"

	"github.com/willikay11/wrench/api/internal/cache"
	"github.com/willikay11/wrench/api/internal/config"
	emaildispatchsvc "github.com/willikay11/wrench/api/internal/core/services/emaildispatch"
	waitlistsvc "github.com/willikay11/wrench/api/internal/core/services/waitlist"
	"github.com/willikay11/wrench/api/internal/mailer"
	"github.com/willikay11/wrench/api/internal/postgres"
	"github.com/willikay11/wrench/api/internal/rest"
	"github.com/willikay11/wrench/api/internal/worker"
)

func main() {
	_ = godotenv.Load()

	// Structured logging
	zerolog.TimeFieldFormat = zerolog.TimeFormatUnix
	log.Logger = log.With().Caller().Logger()

	// Fail-fast config loading
	// If any required env var is missing → os.Exit(1)
	cfg, err := config.Load()

	if err != nil {
		log.Fatal().Err(err).Msg("Failed to load config")
	}

	startUpCtx, cancelStartUpCtx := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancelStartUpCtx()

	pool, err := postgres.NewPool(startUpCtx, cfg.DatabaseURL)
	if err != nil {
		log.Fatal().Err(err).Msg("Failed to connect to Postgres")
	}
	defer pool.Close()

	// Redis client
	redisClient, err := cache.Redis(startUpCtx, cfg.RedisURL)
	if err != nil {
		log.Fatal().Err(err).Msg("Failed to connect to Redis")

	}
	defer func() { _ = redisClient.Close() }()

	// Custom client so the notifier can capture response status codes for
	// permanent-vs-transient classification, and so sends actually time out.
	resendClient := resend.NewCustomClient(mailer.NewHTTPClient(15*time.Second), cfg.ResendAPIKey)

	// Driven adapters
	waitlistRepo := postgres.NewWaitlistRepository(pool)
	waitlistRedis := cache.NewWaitlistRedis(redisClient)

	emailOutbox := postgres.NewOutbox(pool)
	emailSender := mailer.NewResend(resendClient, cfg.FromEmail)
	transactionManager := postgres.NewTxManager(pool)

	// Core services
	waitlistSvc := waitlistsvc.NewService(waitlistRepo, waitlistRedis, emailOutbox, transactionManager)
	emailDispatchSvc := emaildispatchsvc.NewService(emailOutbox, emailSender, cfg.EmailBatchSize, cfg.EmailStaleAfter)

	// Driving adapters
	waitlistHandler := rest.NewWaitlistHandler(waitlistSvc)
	emailWorker := worker.NewDispatcher(emailDispatchSvc, cfg.EmailPollInterval, cfg.EmailTickTimeout)

	// Router
	r := chi.NewRouter()

	// Global middleware
	r.Use(middleware.RequestID)
	// Before Recoverer so a panic is logged as the 500 it turns into, and
	// after RequestID so the id is available to log.
	r.Use(rest.RequestLogger)
	// middleware.RealIP is deliberately not used: it rewrites r.RemoteAddr
	// from client-controlled headers (X-Forwarded-For, True-Client-IP,
	// X-Real-IP) whether or not our infrastructure sets them, so any per-IP
	// rate limit built on it would be trivially bypassed. See GHSA-3fxj-6jh8-hvhx.
	// When client IP is needed, parse X-Forwarded-For with a known count of
	// trusted proxies in front (Kong, per ADR-008).
	r.Use(middleware.Recoverer)

	// Health check (no auth — Kong polls this)
	r.Get("/health", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		_, _ = fmt.Fprintf(w, `{"status":"ok","version":"%s"}`, cfg.Version)
	})

	// API routes
	r.Post("/v1/waitlist", waitlistHandler.JoinWaitlist)
	r.Get("/v1/waitlist/count", waitlistHandler.CountWaitlist)

	// Server with timeouts
	srv := &http.Server{
		Addr:         fmt.Sprintf(":%s", cfg.Port),
		Handler:      r,
		ReadTimeout:  15 * time.Second,
		WriteTimeout: 60 * time.Second, // 60s for SSE streaming
		IdleTimeout:  120 * time.Second,
	}

	// Start server in goroutine
	go func() {
		log.Info().Str("port", cfg.Port).Msg("Starting Wrench API")
		if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			log.Fatal().Err(err).Msg("Server failed")
		}
	}()

	// Start the email dispatch worker. workerDone lets shutdown wait for an
	// in-flight batch instead of killing it mid-send.
	workerCtx, stopWorker := context.WithCancel(context.Background())
	workerDone := make(chan struct{})

	go func() {
		defer close(workerDone)
		emailWorker.Run(workerCtx)
	}()

	// Graceful shutdown
	// Wait for SIGTERM (Railway sends this on deploy/stop)
	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
	<-quit

	log.Info().Msg("Shutting down — draining connections")

	// Give in-flight requests 30 seconds to complete
	shutdownCtx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	// Tell the worker to stop scheduling new batches, then drain HTTP while
	// its current batch finishes.
	stopWorker()

	if err := srv.Shutdown(shutdownCtx); err != nil {
		// Not fatal: exiting here would abandon the worker mid-batch.
		log.Error().Err(err).Msg("Forced HTTP shutdown")
	}

	select {
	case <-workerDone:
		log.Info().Msg("Email dispatcher drained")
	case <-shutdownCtx.Done():
		log.Warn().Msg("Email dispatcher did not drain in time — rows may be left in processing")
	}

	log.Info().Msg("Server stopped cleanly")
}
