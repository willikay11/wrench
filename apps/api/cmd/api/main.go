package main

import (
	"fmt"
	"net/http"
	"os"

	"github.com/rs/zerolog"
	"github.com/rs/zerolog/log"
	"github.com/willikay11/wrench/api/internal/config"
)

func main() {
	// UNIX Time is faster and smaller than most timestamps
	zerolog.TimeFieldFormat = zerolog.TimeFormatUnix

	cfg, err := config.LoadConfig()
	if err != nil {
		log.Error().Msg("Failed to load .env configurations")
		os.Exit(1)
	}

	http.HandleFunc("/health", func(w http.ResponseWriter, r *http.Request) {
		returnCode := http.StatusOK
		w.WriteHeader(returnCode)
		if _, err := w.Write([]byte(fmt.Sprintf("version: 0.1.0, status: %d", returnCode))); err != nil {
			log.Error().Err(err).Msg("Failed to write health response")
		}
	})

	addr := fmt.Sprintf(":%s", cfg.Port)
	log.Info().Msgf("Starting server on %s", addr)
	if err := http.ListenAndServe(addr, nil); err != nil {
		log.Fatal().Err(err).Msg("Server failed")
		os.Exit(1)
	}
}
