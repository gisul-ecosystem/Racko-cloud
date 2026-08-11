using System.IO;
using System.Text.Json;
using System.Text.Json.Serialization;

namespace RackoApp.Services;

/// <summary>
/// Reads the config.json and agent.json written by the Go agent installer. 
/// These files live in C:\ProgramData\racko-agent\ on Windows.
/// </summary>
public class AgentConfig
{
    public string PlatformUrl  { get; init; } = "";
    public string AccountToken { get; init; } = "";
    public string AgentId      { get; init; } = "";

    private static readonly string DataDir =
        Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.CommonApplicationData),
                     "racko-agent");

    public static AgentConfig Load()
    {
        // ── config.json ────────────────────────────────────────────────────
        var configPath = Path.Combine(DataDir, "config.json");
        if (!File.Exists(configPath))
            throw new FileNotFoundException($"Agent config not found at {configPath}");

        var configJson = File.ReadAllText(configPath);
        var raw = JsonSerializer.Deserialize<RawConfig>(configJson,
            new JsonSerializerOptions { PropertyNameCaseInsensitive = true })
            ?? throw new InvalidDataException("config.json is empty or malformed.");

        if (string.IsNullOrWhiteSpace(raw.PlatformUrl))
            throw new InvalidDataException("PLATFORM_URL is missing in config.json.");

        // ── agent.json ────────────────────────────────────────────────────
        var agentPath = Path.Combine(DataDir, "agent.json");
        string agentId = "";
        if (File.Exists(agentPath))
        {
            var agentJson = File.ReadAllText(agentPath);
            var agentRaw  = JsonSerializer.Deserialize<RawAgent>(agentJson,
                new JsonSerializerOptions { PropertyNameCaseInsensitive = true });
            agentId = agentRaw?.AgentId ?? "";
        }

        if (string.IsNullOrWhiteSpace(agentId))
            throw new InvalidOperationException(
                "Agent is not registered yet.\nPlease wait for the Racko Agent service to start, then reopen this app.");

        return new AgentConfig
        {
            PlatformUrl  = raw.PlatformUrl.TrimEnd('/'),
            AccountToken = raw.AccountToken ?? "",
            AgentId      = agentId,
        };
    }

    // ── Private DTOs ───────────────────────────────────────────────────────

    private record RawConfig(
        [property: JsonPropertyName("PLATFORM_URL")]  string? PlatformUrl,
        [property: JsonPropertyName("ACCOUNT_TOKEN")] string? AccountToken
    );

    private record RawAgent(
        [property: JsonPropertyName("agent_id")] string? AgentId
    );
}
