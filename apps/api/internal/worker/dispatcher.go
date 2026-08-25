// Package worker holds driving adapters that act on a timer rather than on an
// inbound request. It depends only on the driving ports in core, so moving a
// worker into its own cmd/worker binary later means writing a new main and
// nothing else.
package worker

import (
	"context"
	"time"

	"github.com/rs/zerolog/log"

	"github.com/willikay11/wrench/api/internal/core/ports"
)

// Dispatcher polls the email dispatch service on a fixed interval.
type Dispatcher struct {
	dispatcher  ports.EmailDispatcher
	interval    time.Duration
	tickTimeout time.Duration
}

// NewDispatcher polls every interval, allowing each pass up to tickTimeout.
//
// tickTimeout is deliberately independent of interval: how often to look for
// work and how long a batch may take are different questions, and tying them
// together means a short interval silently starves the send. A pass that
// outlives its interval simply delays the next tick — Run calls each pass
// synchronously, so passes never overlap.
func NewDispatcher(dispatcher ports.EmailDispatcher, interval, tickTimeout time.Duration) *Dispatcher {
	return &Dispatcher{
		dispatcher:  dispatcher,
		interval:    interval,
		tickTimeout: tickTimeout,
	}
}

// Run polls until ctx is cancelled, then returns. It blocks, so callers run it
// in a goroutine and wait for it to return before exiting the process.
func (d *Dispatcher) Run(ctx context.Context) {
	ticker := time.NewTicker(d.interval)
	defer ticker.Stop()

	log.Info().Dur("interval", d.interval).Dur("tickTimeout", d.tickTimeout).Msg("Email dispatcher started")

	for {
		select {
		case <-ctx.Done():
			log.Info().Msg("Email dispatcher stopped")
			return
		case <-ticker.C:
			d.tick(ctx)
		}
	}
}

// tick runs one dispatch pass. Because it is called synchronously from Run,
// a cancellation arriving mid-pass is not observed until the pass returns —
// which is deliberate, see below.
func (d *Dispatcher) tick(ctx context.Context) {
	// Detach from the shutdown signal. By this point the service has already
	// claimed rows and set them to 'processing'; killing the pass mid-send
	// strands them there until the reaper runs, and can drop an email that
	// Resend already accepted. The timeout bounds how long a hung send can
	// hold up shutdown.
	tickCtx, cancel := context.WithTimeout(context.WithoutCancel(ctx), d.tickTimeout)
	defer cancel()

	d.dispatcher.DispatchPending(tickCtx)
}
