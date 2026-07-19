# Dockerfile (repo root)

# Stage 1 — Build
FROM golang:1.23-alpine AS builder

WORKDIR /app

# Copy Go module files from apps/api
COPY apps/api/go.mod apps/api/go.sum ./

RUN go mod download

# Copy the entire api source
COPY apps/api/ .

# Build binary
RUN CGO_ENABLED=0 GOOS=linux GOARCH=amd64 \
    go build -ldflags="-w -s" \
    -o wrench-api ./cmd/api/main.go

# Stage 2 — Run
FROM gcr.io/distroless/static-debian12

WORKDIR /app

COPY --from=builder /app/wrench-api .
COPY --from=builder /app/db/migrations ./db/migrations
COPY --from=builder /go/bin/goose .

EXPOSE 8080

CMD ["./wrench-api"]