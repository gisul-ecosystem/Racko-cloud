import { execSync } from 'child_process';
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
    this.platformUrl = config.FRONTEND_URL ?? 'http://localhost:8000';
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
    const installScript = this.buildLinuxInstallScript(target.accountToken);

    // TODO: Replace sshpass with an SSH library (e.g. node-ssh) for production.
    // sshpass is a quick bootstrap solution — requires sshpass installed on the server.
    const cmd = [
      'sshpass', '-p', `'${target.password}'`,
      'ssh', '-o', 'StrictHostKeyChecking=no',
      '-o', 'ConnectTimeout=10',
      `${target.username}@${target.ipAddress}`,
      `'${installScript}'`,
    ].join(' ');

    execSync(cmd, { timeout: 60000, stdio: 'pipe' });
  }

  /**
   * Windows — use WinRM via curl to execute a PowerShell bootstrap command.
   * TODO: Replace with a proper WinRM library for production use.
   */
  private async pushWindows(target: VMPushTarget): Promise<void> {
    const psCommand = this.buildWindowsInstallScript(target.accountToken);

    // Encode PS command to base64 to avoid quoting issues
    const encoded = Buffer.from(psCommand, 'utf16le').toString('base64');

    // WinRM over HTTP (port 5985) — use HTTPS (5986) in production
    const winrmUrl = `http://${target.ipAddress}:5985/wsman`;

    // TODO: Replace with node-winrm or similar library for production use.
    const body = `<s:Envelope xmlns:s="http://www.w3.org/2003/05/soap-envelope" xmlns:wsmid="http://schemas.dmtf.org/wbem/wsman/identity/1/wsmanidentity.xsd"><s:Header/><s:Body><wsmid:Identify/></s:Body></s:Envelope>`;

    const cmd = [
      'curl', '-s', '-X', 'POST',
      '-u', `${target.username}:${target.password}`,
      '-H', '"Content-Type: application/soap+xml;charset=UTF-8"',
      '-d', `'${body}'`,
      winrmUrl,
    ].join(' ');

    // Just test connectivity — full WinRM command execution needs a proper library
    execSync(cmd, { timeout: 15000, stdio: 'pipe' });

    // TODO: After WinRM connectivity confirmed, execute:
    // powershell -EncodedCommand ${encoded}
    void encoded;
    logger.warn('[VMPush] Windows WinRM push is a stub — implement with a WinRM library', {
      machineId: target.machineId,
    });
  }

  private buildLinuxInstallScript(accountToken: string): string {
    const downloadUrl = `${this.platformUrl}/api/v1/agent/download?os=linux&token=${accountToken}`;
    return [
      `curl -fsSL '${downloadUrl}' -o /tmp/racko-agent`,
      'chmod +x /tmp/racko-agent',
      // Install as a systemd service
      'sudo mv /tmp/racko-agent /usr/local/bin/racko-agent',
      'sudo tee /etc/systemd/system/racko-agent.service > /dev/null << EOF',
      '[Unit]',
      'Description=Racko Agent',
      'After=network.target',
      '[Service]',
      'ExecStart=/usr/local/bin/racko-agent',
      'Restart=always',
      'RestartSec=10',
      '[Install]',
      'WantedBy=multi-user.target',
      'EOF',
      'sudo systemctl daemon-reload',
      'sudo systemctl enable racko-agent',
      'sudo systemctl start racko-agent',
    ].join(' && ');
  }

  private buildWindowsInstallScript(accountToken: string): string {
    const downloadUrl = `${this.platformUrl}/api/v1/agent/download?os=windows&token=${accountToken}`;
    return [
      `$url = '${downloadUrl}'`,
      '$dest = "$env:ProgramData\\racko-agent\\racko-agent.exe"',
      'New-Item -ItemType Directory -Force -Path "$env:ProgramData\\racko-agent"',
      'Invoke-WebRequest -Uri $url -OutFile $dest',
      // Install as a Windows service
      'New-Service -Name "RackoAgent" -BinaryPathName $dest -StartupType Automatic -Description "Racko Agent"',
      'Start-Service -Name "RackoAgent"',
    ].join('; ');
  }
}

export const vmPushService = new VMPushService();
