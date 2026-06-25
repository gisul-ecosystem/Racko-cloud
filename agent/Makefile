BINARY_WINDOWS = dist/racko-agent.exe
BINARY_LINUX   = dist/racko-agent
BINARY_MAC     = dist/racko-agent-mac

# Physical/VM push build (bake accountToken):
#   make build-windows PLATFORM_URL=https://api.racko.ai ACCOUNT_TOKEN=<token>
#
# Template build (bake enrollmentKey):
#   make build-windows PLATFORM_URL=https://api.racko.ai ENROLLMENT_KEY=<key>

PLATFORM_URL   ?=
ACCOUNT_TOKEN  ?=
ENROLLMENT_KEY ?=

LDFLAGS = -X github.com/racko-ai/agent/config.LDPlatformURL=$(PLATFORM_URL) \
          -X github.com/racko-ai/agent/config.LDAccountToken=$(ACCOUNT_TOKEN) \
          -X github.com/racko-ai/agent/config.LDEnrollmentKey=$(ENROLLMENT_KEY)

.PHONY: build-windows build-linux build-mac build-all clean

build-windows:
	GOOS=windows GOARCH=amd64 go build -ldflags "$(LDFLAGS)" -o $(BINARY_WINDOWS) .

build-linux:
	GOOS=linux GOARCH=amd64 go build -ldflags "$(LDFLAGS)" -o $(BINARY_LINUX) .

build-mac:
	GOOS=darwin GOARCH=amd64 go build -ldflags "$(LDFLAGS)" -o $(BINARY_MAC) .

build-all: build-windows build-linux build-mac

clean:
	rm -rf dist/
