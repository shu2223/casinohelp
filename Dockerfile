# syntax=docker/dockerfile:1

FROM rust:1-bookworm AS build

WORKDIR /app
COPY Cargo.toml Cargo.lock ./
COPY crates ./crates

RUN cargo build --release -p lucky-tools-server

FROM debian:bookworm-slim

WORKDIR /app
ENV PORT=8080

RUN apt-get update -qq \
    && apt-get install --no-install-recommends -y ca-certificates \
    && rm -rf /var/lib/apt/lists/*

COPY --from=build /app/target/release/lucky-tools-server /usr/local/bin/lucky-tools-server

EXPOSE 8080
CMD ["/usr/local/bin/lucky-tools-server"]
