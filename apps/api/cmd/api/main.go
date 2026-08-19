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

	"github.com/willikay11/wrench/api/internal/config"
	waitlistsvc "github.com/willikay11/wrench/api/internal/core/services/waitlist"
	"github.com/willikay11/wrench/api/internal/database"
	waitlisthttp "github.com/willikay11/wrench/api/internal/handler/waitlist"
	transactionalOutboxQueue "github.com/willikay11/wrench/api/internal/repositories/queue"
	transactionManager "github.com/willikay11/wrench/api/internal/repositories/transaction"
	waitlistrepo "github.com/willikay11/wrench/api/internal/repositories/waitlist"
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

	pool, err := database.NewPostgres(startUpCtx, cfg.DatabaseURL)
	if err != nil {
		log.Fatal().Err(err).Msg("Failed to connect to Postgres")
	}
	defer pool.Close()

	// Resend client
	// resendClient := resend.NewClient(cfg.ResendAPIKey)

	// Repositories
	waitlistRepo := waitlistrepo.NewPostgresRepository(pool)
	// resendNotifier := resendNotifier.NewResendNotifier(resendClient, cfg.FromEmail)
	transactionalOutboxQueue := transactionalOutboxQueue.NewTransactionalOutboxQueue(pool)
	txManager := transactionManager.NewTxManager(pool)
	// Services
	waitlistSvc := waitlistsvc.NewService(waitlistRepo, transactionalOutboxQueue, txManager)

	// Handlers
	waitlistHandler := waitlisthttp.NewHTTPHandler(waitlistSvc)

	// Router
	r := chi.NewRouter()

	// Global middleware
	r.Use(middleware.RequestID)
	r.Use(middleware.RealIP)
	r.Use(middleware.Recoverer)

	// Health check (no auth — Kong polls this)
	r.Get("/health", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		fmt.Fprintf(w, `{"status":"ok","version":"%s"}`, cfg.Version)
	})

	// API routes
	r.Post("/v1/waitlist", waitlistHandler.JoinWaitlist)

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

	// Graceful shutdown
	// Wait for SIGTERM (Railway sends this on deploy/stop)
	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
	<-quit

	log.Info().Msg("Shutting down — draining connections")

	// Give in-flight requests 30 seconds to complete
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	if err := srv.Shutdown(ctx); err != nil {
		log.Fatal().Err(err).Msg("Forced shutdown")
	}

	log.Info().Msg("Server stopped cleanly")
}
