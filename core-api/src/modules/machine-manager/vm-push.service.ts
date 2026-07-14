import { NodeSSH } from 'node-ssh';
import * as http from 'http';
import { logger } from '../../utils/logger';
import { config } from '../../config';

export interface VMPushTarget {
  machineId: string;
  ipAddress: string;
  os: 'windows' | 'linux' | 'macos';
  username: string;
  password: string;
  accountToken: string;
}

export interface VMPushResult {
  machineId: string;
  success: boolean;
  error?: string;
}

/**
 * Pushes the Racko agent to a remote VM using SSH (Linux/macOS) or WinRM (Windows).
 * Credentials are used once and never stored after the push completes.
 */
class VMPushService {
  private readonly platformUrl: string;

  constructor() {
    this.platformUrl = config.GATEWAY_URL ?? config.FRONTEND_URL ?? 'http://localhost:8000';
  }

  async pushAgent(target: VMPushTarget): Promise<VMPushResult> {
    try {
      if (target.os === 'windows') {
        await this.pushWindows(target);
      } else {
        await this.pushLinux(target);
      }

      logger.info('[VMPush] Agent pushed successfully', {
        machineId: target.machineId,
        ip: target.ipAddress,
        os: target.os,
      });

      return { machineId: target.machineId, success: true };
    } catch (err) {
      const error = err instanceof Error ? err.message : 'Unknown error';
      logger.error('[VMPush] Failed to push agent', {
        machineId: target.machineId,
        ip: target.ipAddress,
        error,
      });
      return { machineId: target.machineId, success: false, error };
    }
  }

  /**
   * Linux/macOS — SSH into the VM and run a bootstrap curl command.
   * Uses sshpass for password auth (must be installed on the core-api host).
   * In production, replace with SSH key-based auth or a proper SSH library.
   */
  private async pushLinux(target: VMPushTarget): Promise<void> {
    const ssh = new NodeSSH();

    try {
      await ssh.connect({
        host: target.ipAddress,
        username: target.username,
        password: target.password,
        readyTimeout: 10000,
      });

      const installCmd = this.buildLinuxInstallScript(target.accountToken);
      const result = await ssh.execCommand(installCmd, {
        execOptions: { pty: true },
      });

      if (result.code !== 0 && result.code !== null) {
        throw new Error(`Install failed (exit ${result.code}): ${result.stderr}`);
      }

      logger.info('[VMPush] Linux agent installed via SSH', {
        machineId: target.machineId,
        ip: target.ipAddress,
        stdout: result.stdout?.slice(0, 500),
      });
    } finally {
      ssh.dispose();
    }
  }

  /**
   * Windows — push agent via WinRM (HTTP SOAP, port 5985).
   *
   * WinRM is the industry-standard remote management protocol for Windows,
   * used by Ansible, Chef, and all major RMM tools. We implement it directly
   * via HTTP SOAP — no external library needed, just Node's built-in http module.
   *
   * Prerequisites on the target Windows VM:
   *   winrm quickconfig -y
   *   winrm set winrm/config/service/auth '@{Basic="true"}'
   *   winrm set winrm/config/service '@{AllowUnencrypted="true"}'
   *   (or use HTTPS port 5986 with a certificate for production)
   */
  private async pushWindows(target: VMPushTarget): Promise<void> {
    const psScript = this.buildWindowsInstallScript(target.accountToken);

    // Step 1: Create a WinRM shell
    const shellId = await this.winrmCreateShell(target);
    logger.info('[VMPush] WinRM shell created', { machineId: target.machineId, shellId });

    try {
      // Step 2: Run the PowerShell install script
      const commandId = await this.winrmRunCommand(target, shellId, psScript);
      logger.info('[VMPush] WinRM command dispatched', { machineId: target.machineId, commandId });

      // Step 3: Wait for output/completion
      const { exitCode, stdout, stderr } = await this.winrmGetOutput(target, shellId, commandId);

      logger.info('[VMPush] WinRM command completed', {
        machineId: target.machineId,
        exitCode,
        stdout: stdout.slice(0, 500),
        stderr: stderr.slice(0, 500),
      });

      if (exitCode !== 0) {
        throw new Error(`PowerShell install failed (exit ${exitCode}): ${stderr || stdout}`);
      }
    } finally {
      // Step 4: Always delete the shell to free resources on the remote machine
      await this.winrmDeleteShell(target, shellId).catch(() => { /* best-effort */ });
    }
  }

  // ─── WinRM SOAP helpers ────────────────────────────────────────────────────

  /** Builds the WinRM Authorization header (Basic auth, base64 encoded). */
  private winrmAuthHeader(username: string, password: string): string {
    return 'Basic ' + Buffer.from(`${username}:${password}`).toString('base64');
  }

  /** Sends a raw WinRM SOAP request and returns the response body as a string. */
  private winrmRequest(
    target: VMPushTarget,
    body: string,
    timeoutMs = 30000,
  ): Promise<string> {
    return new Promise((resolve, reject) => {
      const postData = Buffer.from(body, 'utf8');
      const options: http.RequestOptions = {
        hostname: target.ipAddress,
        port: 5985,
        path: '/wsman',
        method: 'POST',
        headers: {
          'Authorization': this.winrmAuthHeader(target.username, target.password),
          'Content-Type': 'application/soap+xml;charset=UTF-8',
          'Content-Length': postData.length,
        },
        timeout: timeoutMs,
      };

      const req = http.request(options, (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (chunk: Buffer) => chunks.push(chunk));
        res.on('end', () => {
          const responseBody = Buffer.concat(chunks).toString('utf8');
          if (res.statusCode && res.statusCode >= 400) {
            reject(new Error(`WinRM HTTP ${res.statusCode}: ${responseBody.slice(0, 300)}`));
          } else {
            resolve(responseBody);
          }
        });
      });

      req.on('error', reject);
      req.on('timeout', () => { req.destroy(); reject(new Error('WinRM request timed out')); });
      req.write(postData);
      req.end();
    });
  }

  /** Creates a WinRM command shell and returns the ShellId. */
  private async winrmCreateShell(target: VMPushTarget): Promise<string> {
    const uuid = `uuid:${crypto.randomUUID()}`;
    const body = `<?xml version="1.0" encoding="UTF-8"?>
<s:Envelope xmlns:s="http://www.w3.org/2003/05/soap-envelope"
            xmlns:wsmv="http://schemas.microsoft.com/wbem/wsman/1/wsman.xsd"
            xmlns:wsa="http://schemas.xmlsoap.org/ws/2004/08/addressing"
            xmlns:rsp="http://schemas.microsoft.com/wbem/wsman/1/windows/shell"
            xmlns:w="http://schemas.dmtf.org/wbem/wsman/1/wsman.xsd">
  <s:Header>
    <wsa:To>http://${target.ipAddress}:5985/wsman</wsa:To>
    <wsa:ReplyTo><wsa:Address s:mustUnderstand="true">http://schemas.xmlsoap.org/ws/2004/08/addressing/role/anonymous</wsa:Address></wsa:ReplyTo>
    <wsa:Action s:mustUnderstand="true">http://schemas.xmlsoap.org/ws/2004/09/transfer/Create</wsa:Action>
    <wsa:MessageID>${uuid}</wsa:MessageID>
    <w:ResourceURI s:mustUnderstand="true">http://schemas.microsoft.com/wbem/wsman/1/windows/shell/cmd</w:ResourceURI>
    <w:OperationTimeout>PT60.000S</w:OperationTimeout>
  </s:Header>
  <s:Body>
    <rsp:Shell>
      <rsp:InputStreams>stdin</rsp:InputStreams>
      <rsp:OutputStreams>stdout stderr</rsp:OutputStreams>
    </rsp:Shell>
  </s:Body>
</s:Envelope>`;

    const response = await this.winrmRequest(target, body, 30000);
    const match = response.match(/<rsp:ShellId>([^<]+)<\/rsp:ShellId>/);
    if (!match) throw new Error(`WinRM CreateShell failed — no ShellId in response: ${response.slice(0, 300)}`);
    return match[1];
  }

  /** Runs a PowerShell command in the shell and returns the CommandId. */
  private async winrmRunCommand(target: VMPushTarget, shellId: string, psScript: string): Promise<string> {
    const uuid = `uuid:${crypto.randomUUID()}`;
    // Encode to base64 UTF-16LE so we can pass arbitrary PowerShell without quoting issues
    const encoded = Buffer.from(psScript, 'utf16le').toString('base64');
    const command = `powershell -NonInteractive -ExecutionPolicy Bypass -EncodedCommand ${encoded}`;

    const body = `<?xml version="1.0" encoding="UTF-8"?>
<s:Envelope xmlns:s="http://www.w3.org/2003/05/soap-envelope"
            xmlns:wsa="http://schemas.xmlsoap.org/ws/2004/08/addressing"
            xmlns:rsp="http://schemas.microsoft.com/wbem/wsman/1/windows/shell"
            xmlns:w="http://schemas.dmtf.org/wbem/wsman/1/wsman.xsd">
  <s:Header>
    <wsa:To>http://${target.ipAddress}:5985/wsman</wsa:To>
    <wsa:ReplyTo><wsa:Address s:mustUnderstand="true">http://schemas.xmlsoap.org/ws/2004/08/addressing/role/anonymous</wsa:Address></wsa:ReplyTo>
    <wsa:Action s:mustUnderstand="true">http://schemas.microsoft.com/wbem/wsman/1/windows/shell/Command</wsa:Action>
    <wsa:MessageID>${uuid}</wsa:MessageID>
    <w:ResourceURI s:mustUnderstand="true">http://schemas.microsoft.com/wbem/wsman/1/windows/shell/cmd</w:ResourceURI>
    <w:SelectorSet><w:Selector Name="ShellId">${shellId}</w:Selector></w:SelectorSet>
    <w:OperationTimeout>PT300.000S</w:OperationTimeout>
  </s:Header>
  <s:Body>
    <rsp:CommandLine>
      <rsp:Command>${this.xmlEscape(command)}</rsp:Command>
    </rsp:CommandLine>
  </s:Body>
</s:Envelope>`;

    const response = await this.winrmRequest(target, body, 30000);
    const match = response.match(/<rsp:CommandId>([^<]+)<\/rsp:CommandId>/);
    if (!match) throw new Error(`WinRM Command failed — no CommandId in response: ${response.slice(0, 300)}`);
    return match[1];
  }

  /** Polls for command output until the command completes, returns exit code + output. */
  private async winrmGetOutput(
    target: VMPushTarget,
    shellId: string,
    commandId: string,
  ): Promise<{ exitCode: number; stdout: string; stderr: string }> {
    let stdout = '';
    let stderr = '';
    let exitCode = -1;
    const maxWait = 10 * 60 * 1000; // 10 minutes max
    const startTime = Date.now();

    while (Date.now() - startTime < maxWait) {
      const uuid = `uuid:${crypto.randomUUID()}`;
      const body = `<?xml version="1.0" encoding="UTF-8"?>
<s:Envelope xmlns:s="http://www.w3.org/2003/05/soap-envelope"
            xmlns:wsa="http://schemas.xmlsoap.org/ws/2004/08/addressing"
            xmlns:rsp="http://schemas.microsoft.com/wbem/wsman/1/windows/shell"
            xmlns:w="http://schemas.dmtf.org/wbem/wsman/1/wsman.xsd">
  <s:Header>
    <wsa:To>http://${target.ipAddress}:5985/wsman</wsa:To>
    <wsa:ReplyTo><wsa:Address s:mustUnderstand="true">http://schemas.xmlsoap.org/ws/2004/08/addressing/role/anonymous</wsa:Address></wsa:ReplyTo>
    <wsa:Action s:mustUnderstand="true">http://schemas.microsoft.com/wbem/wsman/1/windows/shell/Receive</wsa:Action>
    <wsa:MessageID>${uuid}</wsa:MessageID>
    <w:ResourceURI s:mustUnderstand="true">http://schemas.microsoft.com/wbem/wsman/1/windows/shell/cmd</w:ResourceURI>
    <w:SelectorSet><w:Selector Name="ShellId">${shellId}</w:Selector></w:SelectorSet>
    <w:OperationTimeout>PT30.000S</w:OperationTimeout>
  </s:Header>
  <s:Body>
    <rsp:Receive>
      <rsp:DesiredStream CommandId="${commandId}">stdout stderr</rsp:DesiredStream>
    </rsp:Receive>
  </s:Body>
</s:Envelope>`;

      const response = await this.winrmRequest(target, body, 35000);

      // Decode base64-encoded stdout/stderr chunks
      const stdoutMatches = response.matchAll(/<rsp:Stream Name="stdout"[^>]*>([^<]*)<\/rsp:Stream>/g);
      for (const m of stdoutMatches) {
        if (m[1]) stdout += Buffer.from(m[1], 'base64').toString('utf8');
      }
      const stderrMatches = response.matchAll(/<rsp:Stream Name="stderr"[^>]*>([^<]*)<\/rsp:Stream>/g);
      for (const m of stderrMatches) {
        if (m[1]) stderr += Buffer.from(m[1], 'base64').toString('utf8');
      }

      // Check if command is done
      const exitCodeMatch = response.match(/<rsp:ExitCode>(\d+)<\/rsp:ExitCode>/);
      if (exitCodeMatch) {
        exitCode = parseInt(exitCodeMatch[1], 10);
        break;
      }

      // Not done yet — short pause before next poll
      await new Promise((r) => setTimeout(r, 1000));
    }

    if (exitCode === -1) throw new Error('WinRM command timed out waiting for output');
    return { exitCode, stdout, stderr };
  }

  /** Deletes the WinRM shell to free resources on the remote machine. */
  private async winrmDeleteShell(target: VMPushTarget, shellId: string): Promise<void> {
    const uuid = `uuid:${crypto.randomUUID()}`;
    const body = `<?xml version="1.0" encoding="UTF-8"?>
<s:Envelope xmlns:s="http://www.w3.org/2003/05/soap-envelope"
            xmlns:wsa="http://schemas.xmlsoap.org/ws/2004/08/addressing"
            xmlns:w="http://schemas.dmtf.org/wbem/wsman/1/wsman.xsd">
  <s:Header>
    <wsa:To>http://${target.ipAddress}:5985/wsman</wsa:To>
    <wsa:ReplyTo><wsa:Address s:mustUnderstand="true">http://schemas.xmlsoap.org/ws/2004/08/addressing/role/anonymous</wsa:Address></wsa:ReplyTo>
    <wsa:Action s:mustUnderstand="true">http://schemas.xmlsoap.org/ws/2004/09/transfer/Delete</wsa:Action>
    <wsa:MessageID>${uuid}</wsa:MessageID>
    <w:ResourceURI s:mustUnderstand="true">http://schemas.microsoft.com/wbem/wsman/1/windows/shell/cmd</w:ResourceURI>
    <w:SelectorSet><w:Selector Name="ShellId">${shellId}</w:Selector></w:SelectorSet>
  </s:Header>
  <s:Body/>
</s:Envelope>`;

    await this.winrmRequest(target, body, 10000);
  }

  /** Escapes special XML characters in a string for safe embedding in SOAP XML. */
  private xmlEscape(str: string): string {
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');
  }

  private buildLinuxInstallScript(accountToken: string): string {
    return `curl -fsSL '${this.platformUrl}/api/v1/agent/install/linux?token=${accountToken}' | sudo bash`;
  }

  private buildWindowsInstallScript(accountToken: string): string {
    // Download the agent binary from the existing /api/v1/agent/binary/windows endpoint,
    // write config.json, register as a Windows service, and start it.
    // Mirrors what the Inno Setup installer does, but fully scriptable via WinRM.
    const binaryUrl = `${this.platformUrl}/api/v1/agent/binary/windows`;
    const installDir = 'C:\\ProgramData\\racko-agent';
    const configContent = JSON.stringify({
      PLATFORM_URL: this.platformUrl,
      ACCOUNT_TOKEN: accountToken,
    });

    return [
      '$ErrorActionPreference = "Stop"',
      `$installDir = '${installDir}'`,
      `$binaryUrl = '${binaryUrl}'`,
      `$configContent = '${configContent}'`,
      'Write-Host "[racko] Creating install directory..."',
      'New-Item -ItemType Directory -Force -Path $installDir | Out-Null',
      'Write-Host "[racko] Downloading agent binary..."',
      'Invoke-WebRequest -Uri $binaryUrl -OutFile "$installDir\\racko-agent.exe" -UseBasicParsing',
      'Write-Host "[racko] Writing config..."',
      // [System.IO.File]::WriteAllText writes UTF-8 WITHOUT BOM — critical because
      // PowerShell Set-Content -Encoding UTF8 adds a BOM (EF BB BF) which breaks
      // Go's json.NewDecoder and causes all config fields to parse as empty strings.
      '[System.IO.File]::WriteAllText("$installDir\\config.json", $configContent, [System.Text.UTF8Encoding]::new($false))',
      // Stop and remove any existing service before creating
      'sc.exe stop RackoAgent 2>$null; sc.exe delete RackoAgent 2>$null; Start-Sleep -Seconds 2',
      'Write-Host "[racko] Registering Windows service..."',
      'sc.exe create RackoAgent binpath= "$installDir\\racko-agent.exe" start= auto displayname= "Racko Agent" obj= LocalSystem',
      'sc.exe description RackoAgent "Racko software management agent"',
      'Write-Host "[racko] Starting service..."',
      'sc.exe start RackoAgent',
      'Write-Host "[racko] Agent installed and started successfully."',
    ].join('; ');
  }
}

export const vmPushService = new VMPushService();
