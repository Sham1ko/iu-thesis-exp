FROM golang:1.22-alpine AS build

WORKDIR /app

COPY go.mod ./
COPY main.go ./

RUN CGO_ENABLED=0 GOOS=linux GOARCH=amd64 go build -ldflags="-s -w" -o server .

FROM alpine:3.20

WORKDIR /app

COPY --from=build /app/server /app/server

ENV PORT=8080

EXPOSE 8080

CMD ["/app/server"]
