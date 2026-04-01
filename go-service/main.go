package main

import (
	"context"
	"encoding/json"
	"log"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"
)

var startupTime = time.Now().UTC()

type pingResponse struct {
	Message   string    `json:"message"`
	Runtime   string    `json:"runtime"`
	Hostname  string    `json:"hostname"`
	Timestamp time.Time `json:"timestamp"`
	Startup   time.Time `json:"startup_timestamp"`
	UptimeMS  int64     `json:"uptime_ms"`
}

func main() {
	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}

	log.Printf("startup timestamp: %s", startupTime.Format(time.RFC3339Nano))

	hostname, err := os.Hostname()
	if err != nil {
		log.Printf("hostname lookup failed: %v", err)
		hostname = "unknown"
	}

	mux := http.NewServeMux()
	mux.HandleFunc("/ping", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet {
			http.Error(w, http.StatusText(http.StatusMethodNotAllowed), http.StatusMethodNotAllowed)
			return
		}

		now := time.Now().UTC()
		payload := pingResponse{
			Message:   "pong",
			Runtime:   "go",
			Hostname:  hostname,
			Timestamp: now,
			Startup:   startupTime,
			UptimeMS:  now.Sub(startupTime).Milliseconds(),
		}

		w.Header().Set("Content-Type", "application/json")
		if err := json.NewEncoder(w).Encode(payload); err != nil {
			log.Printf("encode /ping response: %v", err)
		}
	})

	server := &http.Server{
		Addr:              ":" + port,
		Handler:           mux,
		ReadHeaderTimeout: 5 * time.Second,
	}

	go func() {
		log.Printf("listening on :%s", port)
		if err := server.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			log.Fatalf("server failed: %v", err)
		}
	}()

	stop := make(chan os.Signal, 1)
	signal.Notify(stop, os.Interrupt, syscall.SIGTERM)
	<-stop

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	log.Printf("shutting down")
	if err := server.Shutdown(ctx); err != nil {
		log.Printf("graceful shutdown failed: %v", err)
		if err := server.Close(); err != nil {
			log.Printf("forced close failed: %v", err)
		}
	}
}
