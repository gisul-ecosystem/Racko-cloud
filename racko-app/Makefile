BINARY = racko-app.exe
DIST   = dist

.PHONY: build tidy

build:
	@echo "Building racko-app..."
	@mkdir -p $(DIST)
	GOOS=windows GOARCH=amd64 CGO_ENABLED=1 go build \
		-ldflags="-H windowsgui -s -w" \
		-o $(DIST)/$(BINARY) .
	@echo "Done: $(DIST)/$(BINARY)"

# Linux build (no tray on headless)
build-linux:
	GOOS=linux GOARCH=amd64 CGO_ENABLED=1 go build \
		-o $(DIST)/racko-app .

tidy:
	go mod tidy
