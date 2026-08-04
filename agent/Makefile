BINARY_WINDOWS = dist/racko-agent.exe
BINARY_LINUX   = dist/racko-agent
BINARY_MAC     = dist/racko-agent-mac

# Physical/VM push build (bake accountToken):
#   make build-windows PLATFORM_URL=https://api.racko.ai ACCOUNT_TOKEN=<token>
#
# Template build (bake enrollmentKey):
#   make build-windows PLATFORM_URL=https://api.racko.ai ENROLLMENT_KEY=<key>
#
# Version is baked into every build so the server can compare and trigger auto-update.
# Bump VERSION before each release:
#   make build-all VERSION=1.4.2 PLATFORM_URL=...
#
# After building, compute the checksum and set it in core-api .env:
#   sha256sum dist/racko-agent.exe   → AGENT_CHECKSUM_WINDOWS
#   sha256sum dist/racko-agent       → AGENT_CHECKSUM_LINUX
#   sha256sum dist/racko-agent-mac   → AGENT_CHECKSUM_DARWIN
# Also set AGENT_VERSION=1.4.2 in core-api .env to trigger auto-update rollout.

PLATFORM_URL   ?=
ACCOUNT_TOKEN  ?=
ENROLLMENT_KEY ?=
VERSION        ?= dev

LDFLAGS = -X github.com/racko-ai/agent/config.LDPlatformURL=$(PLATFORM_URL) \
          -X github.com/racko-ai/agent/config.LDAccountToken=$(ACCOUNT_TOKEN) \
          -X github.com/racko-ai/agent/config.LDEnrollmentKey=$(ENROLLMENT_KEY) \
          -X github.com/racko-ai/agent/config.Version=$(VERSION)

.PHONY: build-windows build-linux build-mac build-all clean checksums

build-windows:
	GOOS=windows GOARCH=amd64 go build -ldflags "$(LDFLAGS)" -o $(BINARY_WINDOWS) .

build-linux:
	GOOS=linux GOARCH=amd64 go build -ldflags "$(LDFLAGS)" -o $(BINARY_LINUX) .

build-mac:
	GOOS=darwin GOARCH=amd64 go build -ldflags "$(LDFLAGS)" -o $(BINARY_MAC) .

build-all: build-windows build-linux build-mac

# Print SHA256 checksums for all binaries — copy these into core-api .env
checksums:
	@echo "AGENT_VERSION=$(VERSION)"
	@sha256sum $(BINARY_WINDOWS) | awk '{print "AGENT_CHECKSUM_WINDOWS=" $$1}'
	@sha256sum $(BINARY_LINUX)   | awk '{print "AGENT_CHECKSUM_LINUX=" $$1}'
	@sha256sum $(BINARY_MAC)     | awk '{print "AGENT_CHECKSUM_DARWIN=" $$1}'

clean:
	rm -rf dist/
