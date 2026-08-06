BINARY_WINDOWS = dist/racko-agent.exe
BINARY_LINUX   = dist/racko-agent
BINARY_MAC     = dist/racko-agent-mac

# Physical/VM push build (bake accountToken):
#   make build-windows PLATFORM_URL=https://api.racko.ai ACCOUNT_TOKEN=<token>
#
# Template build (bake enrollmentKey):
#   make build-windows PLATFORM_URL=https://api.racko.ai ENROLLMENT_KEY=<key>
#
# VERSION is read from the VERSION file — bump it manually when agent code changes.
# CI reads VERSION automatically via this Makefile.
# To release a new agent version:
#   1. Edit agent/VERSION (e.g. 1.0.1)
#   2. Push — CI builds new binaries, bakes new version into core-api image
#   3. All connected agents update themselves within 30 seconds

PLATFORM_URL   ?=
ACCOUNT_TOKEN  ?=
ENROLLMENT_KEY ?=
VERSION        := $(shell cat VERSION 2>/dev/null | tr -d '[:space:]')

LDFLAGS = -X github.com/racko-ai/agent/config.LDPlatformURL=$(PLATFORM_URL) \
          -X github.com/racko-ai/agent/config.LDAccountToken=$(ACCOUNT_TOKEN) \
          -X github.com/racko-ai/agent/config.LDEnrollmentKey=$(ENROLLMENT_KEY) \
          -X github.com/racko-ai/agent/config.Version=$(VERSION)

.PHONY: build-windows build-linux build-mac build-all clean checksums version

version:
	@cat VERSION

build-windows:
	GOOS=windows GOARCH=amd64 go build -ldflags "$(LDFLAGS)" -o $(BINARY_WINDOWS) .

build-linux:
	GOOS=linux GOARCH=amd64 go build -ldflags "$(LDFLAGS)" -o $(BINARY_LINUX) .

build-mac:
	GOOS=darwin GOARCH=amd64 go build -ldflags "$(LDFLAGS)" -o $(BINARY_MAC) .

build-all: build-windows build-linux build-mac

# Print SHA256 checksums for all binaries — these are automatically picked up by CI
checksums:
	@echo "AGENT_VERSION=$(VERSION)"
	@sha256sum $(BINARY_WINDOWS) | awk '{print "AGENT_CHECKSUM_WINDOWS=" $$1}'
	@sha256sum $(BINARY_LINUX)   | awk '{print "AGENT_CHECKSUM_LINUX=" $$1}'
	@sha256sum $(BINARY_MAC)     | awk '{print "AGENT_CHECKSUM_DARWIN=" $$1}'

clean:
	rm -rf dist/
