BINARY_WINDOWS = dist/racko-agent.exe
BINARY_LINUX   = dist/racko-agent
BINARY_MAC     = dist/racko-agent-mac
RACKO_APP_ZIP  = dist/racko-app.zip

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

.PHONY: build-windows build-linux build-mac build-all build-racko-app clean checksums version

version:
	@cat VERSION

build-windows:
	GOOS=windows GOARCH=amd64 go build -ldflags "$(LDFLAGS)" -o $(BINARY_WINDOWS) .

build-linux:
	GOOS=linux GOARCH=amd64 go build -ldflags "$(LDFLAGS)" -o $(BINARY_LINUX) .

build-mac:
	GOOS=darwin GOARCH=amd64 go build -ldflags "$(LDFLAGS)" -o $(BINARY_MAC) .

# Publish racko-app as a self-contained folder then zip it.
# The zip is served from /api/v1/agent/binary/racko-app and downloaded by the
# VM push script, which extracts it so WebView2Loader.dll is a loose file on disk.
build-racko-app:
	$(eval RACKO_APP_VERSION := $(shell cat ../racko-app/VERSION 2>/dev/null | tr -d '[:space:]'))
	dotnet publish ../racko-app/RackoApp.csproj \
	  -c Release \
	  -r win-x64 \
	  --self-contained true \
	  -p:Version=$(RACKO_APP_VERSION) \
	  -p:InformationalVersion=$(RACKO_APP_VERSION) \
	  -o ../racko-app/publish/
	mkdir -p dist
	cd ../racko-app/publish && zip -r ../../agent/$(RACKO_APP_ZIP) .
	@echo "racko-app.zip built at $(RACKO_APP_ZIP)"

build-all: build-windows build-linux build-mac build-racko-app

# Print SHA256 checksums for all binaries — these are automatically picked up by CI
checksums:
	@echo "AGENT_VERSION=$(VERSION)"
	@sha256sum $(BINARY_WINDOWS) | awk '{print "AGENT_CHECKSUM_WINDOWS=" $$1}'
	@sha256sum $(BINARY_LINUX)   | awk '{print "AGENT_CHECKSUM_LINUX=" $$1}'
	@sha256sum $(BINARY_MAC)     | awk '{print "AGENT_CHECKSUM_DARWIN=" $$1}'
	@if [ -f $(RACKO_APP_ZIP) ]; then \
	  RACKO_APP_VERSION=$$(cat ../racko-app/VERSION 2>/dev/null | tr -d '[:space:]'); \
	  echo "RACKO_APP_VERSION=$$RACKO_APP_VERSION"; \
	  sha256sum $(RACKO_APP_ZIP) | awk '{print "RACKO_APP_CHECKSUM=" $$1}'; \
	fi

clean:
	rm -rf dist/
