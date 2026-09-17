package installer

import "fmt"

// platformChocoURL is set once at startup via Init().
// It points to the platform's internal Chocolatey nupkg endpoint,
// avoiding community.chocolatey.org rate limits.
var platformChocoURL string

// Init sets the platform URL for internal package downloads.
// Must be called once before any installs are attempted.
func Init(platformURL string) {
	platformChocoURL = platformURL + "/api/v1/agent/binary/chocolatey"
}

// SoftwarePackage mirrors the relevant fields from the platform's SoftwareCatalog.
// The agent fetches this from GET /api/v1/agent/software-catalog/:id before installing.
type SoftwarePackage struct {
	ID               string `json:"_id"`
	Name             string `json:"name"`
	Version          string `json:"version"`
	InstallMethod    string `json:"installMethod"` // winget|apt|brew|choco|msi|exe|zip|script
	WingetID         string `json:"wingetId"`
	AptName          string `json:"aptName"`
	BrewName         string `json:"brewName"`
	ChocoName        string `json:"chocoName"`
	FileURL          string `json:"fileUrl"`
	FileName         string `json:"fileName"`
	ZipInstallScript string `json:"zipInstallScript"` // PowerShell script run after ZIP extraction
	PostInstallScript string `json:"postInstallScript"` // PowerShell script run after msi/exe install
	InstallArgs      string `json:"installArgs"`
}

// Install dispatches to the platform-specific installer based on the package's
// InstallMethod and the OS the agent is running on.
// Returns combined stdout+stderr logs and any error.
func Install(pkg SoftwarePackage) (string, error) {
	if pkg.InstallMethod == "" {
		return "", fmt.Errorf("installMethod is empty for software %s", pkg.ID)
	}
	return installOnPlatform(pkg)
}
