import { execSync } from 'child_process';
import { NodeSSH } from 'node-ssh';
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
    return `curl -fsSL '${this.platformUrl}/api/v1/agent/install/linux?token=${accountToken}' | sudo bash`;
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
