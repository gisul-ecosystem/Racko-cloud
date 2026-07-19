package installer

import "fmt"

// SoftwarePackage mirrors the relevant fields from the platform's SoftwareCatalog.
// The agent fetches this from GET /api/v1/agent/software-catalog/:id before installing.
type SoftwarePackage struct {
	ID            string `json:"_id"`
	Name          string `json:"name"`
	Version       string `json:"version"`
	InstallMethod string `json:"installMethod"` // winget|apt|brew|choco|msi|exe|zip|script
	WingetID      string `json:"wingetId"`
	AptName       string `json:"aptName"`
	BrewName      string `json:"brewName"`
	ChocoName     string `json:"chocoName"`
	FileURL       string `json:"fileUrl"`
	FileName      string `json:"fileName"`
	InstallArgs   string `json:"installArgs"`
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
