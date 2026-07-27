import WebSocket, { WebSocketServer } from 'ws';
import type { IncomingMessage } from 'http';
import type { Server } from 'http';
import { MachineModel } from '../machine-manager.model';
import { logger } from '../../../utils/logger';

// ─── Close Codes ──────────────────────────────────────────────────────────────
// 4010 — agent deleted, stop retrying
// 4011 — agent not found, stop retrying
// 1000 — normal closure

// ─── Types ────────────────────────────────────────────────────────────────────
interface AgentConnection {
  ws: WebSocket;
  agentId: string;
  pingTimer?: ReturnType<typeof setInterval>;
  pongDeadlineTimer?: ReturnType<typeof setTimeout>;
}

interface PendingExec {
  resolve: (result: ExecResult) => void;
  reject: (err: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

export interface ExecResult {
  commandId: string;
  output: string;
  exitCode: number;
}

// ─── WebSocket Manager ────────────────────────────────────────────────────────
class WSManager {
  private connections = new Map<string, AgentConnection>();
  // Pending exec commands awaiting result from agent — keyed by commandId
  private pendingExecs = new Map<string, PendingExec>();

  /**
   * Attach to an existing HTTP server.
   * Upgrades /api/v1/agent/connect requests to WebSocket.
   */
  attach(server: Server): void {
    const wss = new WebSocketServer({ noServer: true });

    server.on('upgrade', (req: IncomingMessage, socket, head) => {
      const url = new URL(req.url ?? '', `http://${req.headers.host}`);
      logger.info('[WSManager] Upgrade event received', { path: url.pathname, url: req.url });
      if (!url.pathname.startsWith('/api/v1/agent/connect')) {
        logger.warn('[WSManager] Upgrade rejected — not agent connect path', { path: url.pathname });
        socket.destroy();
        return;
      }
      wss.handleUpgrade(req, socket as import('net').Socket, head, (ws: WebSocket) => {
        logger.info('[WSManager] Upgrade handled, emitting connection', { path: url.pathname });
        wss.emit('connection', ws, req);
      });
    });

    wss.on('connection', (ws: WebSocket, req: IncomingMessage) => {
      void this.handleConnection(ws, req);
    });

    // Stale heartbeat cleanup: every 2 minutes mark machines offline
    // if lastSeen is older than 3 minutes (handles silent drops)
    setInterval(() => void this.markStaleAgentsOffline(), 2 * 60 * 1000);

    logger.info('[WSManager] WebSocket server attached');
  }

  /**
   * Push a job to a connected agent. Returns true if delivered via WebSocket,
   * false if agent is not connected (falls back to HTTP polling).
   */
  pushJob(agentId: string, job: object): boolean {
    const conn = this.connections.get(agentId);
    if (!conn || conn.ws.readyState !== WebSocket.OPEN) {
      logger.warn('[WSManager] Cannot push job - agent not connected', {
        agentId,
        hasConnection: !!conn,
        readyState: conn?.ws.readyState,
      });
      return false;
    }

    try {
      conn.ws.send(JSON.stringify({ type: 'job', payload: job }));
      logger.info('[WSManager] Pushed job to agent', { agentId, jobId: (job as { _id?: string })._id });
      return true;
    } catch (err) {
      logger.error('[WSManager] Failed to send job', {
        agentId,
        error: err instanceof Error ? err.message : String(err),
      });
      return false;
    }
  }

  /**
   * Send a clone_replay command to a connected agent.
   * Agent fetches the activity manifest from the server and replays all changes.
   * Returns true if delivered, false if agent is offline.
   */
  sendCloneReplay(agentId: string, sessionId: string, sourceMachineId: string): boolean {
    const conn = this.connections.get(agentId);
    if (!conn || conn.ws.readyState !== WebSocket.OPEN) {
      logger.warn('[WSManager] Cannot send clone_replay — agent not connected', { agentId });
      return false;
    }
    try {
      conn.ws.send(JSON.stringify({
        type: 'clone_replay',
        payload: { sessionId, sourceMachineId },
      }));
      logger.info('[WSManager] Sent clone_replay command to agent', { agentId, sessionId, sourceMachineId });
      return true;
    } catch (err) {
      logger.error('[WSManager] Failed to send clone_replay command', {
        agentId,
        error: err instanceof Error ? err.message : String(err),
      });
      return false;
    }
  }

  /**
   * Send a reset command to a connected agent over the existing WebSocket.
   * Agent receives { type: "reset", payload: { sessionId } } and runs the full
   * reset PowerShell script in a background goroutine, sending back progress events.
   * Returns true if delivered, false if agent is offline.
   */
  sendReset(agentId: string, sessionId: string): boolean {
    const conn = this.connections.get(agentId);
    if (!conn || conn.ws.readyState !== WebSocket.OPEN) {
      logger.warn('[WSManager] Cannot send reset — agent not connected', { agentId });
      return false;
    }
    try {
      conn.ws.send(JSON.stringify({ type: 'reset', payload: { sessionId } }));
      logger.info('[WSManager] Sent reset command to agent', { agentId, sessionId });
      return true;
    } catch (err) {
      logger.error('[WSManager] Failed to send reset command', {
        agentId,
        error: err instanceof Error ? err.message : String(err),
      });
      return false;
    }
  }

  /**
   * Send an uninstall command to a connected agent over the existing WebSocket.
   * Agent receives { type: "uninstall" } and immediately runs the cleanup script.
   * Returns true if delivered, false if agent is offline (403 fallback will handle it).
   */
  sendUninstall(agentId: string): boolean {
    const conn = this.connections.get(agentId);
    if (!conn || conn.ws.readyState !== WebSocket.OPEN) {
      logger.warn('[WSManager] Cannot send uninstall — agent not connected', { agentId });
      return false;
    }
    try {
      conn.ws.send(JSON.stringify({ type: 'uninstall' }));
      logger.info('[WSManager] Sent uninstall command to agent', { agentId });
      return true;
    } catch (err) {
      logger.error('[WSManager] Failed to send uninstall command', {
        agentId,
        error: err instanceof Error ? err.message : String(err),
      });
      return false;
    }
  }

  /**
   * Send a PowerShell exec command to the agent and wait for the result.
   * Returns a Promise that resolves with { output, exitCode } when the agent responds.
   * Times out after 60 seconds for normal commands.
   */
  sendExec(agentId: string, commandId: string, command: string, timeoutMs = 60000): Promise<ExecResult> {
    return new Promise((resolve, reject) => {
      const conn = this.connections.get(agentId);
      if (!conn || conn.ws.readyState !== WebSocket.OPEN) {
        reject(new Error('Agent is not connected.'));
        return;
      }

      const timer = setTimeout(() => {
        this.pendingExecs.delete(commandId);
        reject(new Error('Command timed out after 60 seconds.'));
      }, timeoutMs);

      this.pendingExecs.set(commandId, { resolve, reject, timer });

      try {
        conn.ws.send(JSON.stringify({ type: 'exec', payload: { commandId, command } }));
        logger.info('[WSManager] Sent exec command', { agentId, commandId, command: command.slice(0, 100) });
      } catch (err) {
        clearTimeout(timer);
        this.pendingExecs.delete(commandId);
        reject(new Error(`Failed to send exec command: ${err instanceof Error ? err.message : String(err)}`));
      }
    });
  }

  /**
   * Close a specific agent connection with a reason code.
   */
  closeConnection(agentId: string, code: number, reason: string): void {
    const conn = this.connections.get(agentId);
    if (!conn) return;
    conn.ws.close(code, reason);
    logger.info('[WSManager] Closed connection', { agentId, code, reason });
  }

  /**
   * Returns whether an agent is currently connected.
   */
  isConnected(agentId: string): boolean {
    const conn = this.connections.get(agentId);
    return !!conn && conn.ws.readyState === WebSocket.OPEN;
  }

  // ─── Private ────────────────────────────────────────────────────────────────

  private async handleConnection(ws: WebSocket, req: IncomingMessage): Promise<void> {
    const url = new URL(req.url ?? '', `http://${req.headers.host}`);
    const agentId = url.searchParams.get('agentId');

    if (!agentId) {
      ws.close(4011, 'agentId required');
      return;
    }

    // Validate agent in DB
    const machine = await MachineModel.findOne({ agentId });
    if (!machine) {
      logger.warn('[WSManager] Unknown agentId attempted connection', { agentId });
      ws.close(4011, 'Agent not found');
      return;
    }

    if (machine.deleted) {
      logger.warn('[WSManager] Deleted agent attempted reconnection', { agentId });
      ws.close(4010, 'Agent deleted');
      return;
    }

    // Close any existing stale connection for this agent
    const existing = this.connections.get(agentId);
    if (existing) {
      clearInterval(existing.pingTimer);
      clearTimeout(existing.pongDeadlineTimer);
      existing.ws.terminate();
    }

    const conn: AgentConnection = { ws, agentId };
    this.connections.set(agentId, conn);

    // Mark online immediately
    await MachineModel.updateOne({ agentId }, { status: 'online', lastSeen: new Date() });
    logger.info('[WSManager] Agent connected', { agentId, machine: machine.name });

    // Notify push session registry — emits agent_connected SSE event if this machine
    // is part of an active push session. This is the authoritative "agent is alive" signal.
    const { machineManagerService } = await import('../machine-manager.service');
    void machineManagerService.notifyAgentConnected(machine._id.toString(), machine.name);

    // Start ping/pong keepalive every 30s
    conn.pingTimer = setInterval(() => this.sendPing(agentId), 30 * 1000);

    // Handle pong responses
    ws.on('pong', () => {
      const c = this.connections.get(agentId);
      if (!c) return;
      clearTimeout(c.pongDeadlineTimer);
      c.pongDeadlineTimer = undefined;
    });

    // Handle messages from agent (job results, status updates)
    ws.on('message', (data: WebSocket.RawData) => {
      void this.handleMessage(agentId, data);
    });

    // Handle clean disconnect
    ws.on('close', (code: number, reason: Buffer) => {
      this.handleDisconnect(agentId, code, reason.toString());
    });

    // Handle error
    ws.on('error', (err: Error) => {
      logger.error('[WSManager] WebSocket error', { agentId, error: err.message });
      this.handleDisconnect(agentId, 1006, 'socket error');
    });
  }

  private sendPing(agentId: string): void {
    const conn = this.connections.get(agentId);
    if (!conn || conn.ws.readyState !== WebSocket.OPEN) return;

    conn.ws.ping();

    // If no pong within 5 minutes, close the connection.
    // Long installs (e.g. Postman, large software) can take several minutes.
    conn.pongDeadlineTimer = setTimeout(() => {
      logger.warn('[WSManager] Pong timeout, closing connection', { agentId });
      conn.ws.terminate();
      this.handleDisconnect(agentId, 1006, 'pong timeout');
    }, 5 * 60 * 1000);
  }

  private async handleMessage(agentId: string, data: WebSocket.RawData): Promise<void> {
    try {
      const msg = JSON.parse(data.toString()) as { type: string; payload?: unknown };
      logger.info('[WSManager] Message from agent', { agentId, type: msg.type });

      if (msg.type === 'exec_result') {
        const result = msg.payload as ExecResult;
        const pending = this.pendingExecs.get(result.commandId);
        if (pending) {
          clearTimeout(pending.timer);
          this.pendingExecs.delete(result.commandId);
          pending.resolve(result);
          logger.info('[WSManager] Exec result received', { agentId, commandId: result.commandId, exitCode: result.exitCode });
        }
      }

      if (msg.type === 'reset_progress' || msg.type === 'reset_complete') {
        const payload = msg.payload as {
          sessionId: string;
          machineId: string;
          machineName?: string;
          phase?: number;
          message?: string;
          success?: boolean;
          error?: string;
        };
        // payload.machineId from agent is the agentId (UUID), not the MongoDB _id.
        // Resolve it to the actual machine _id so the UI comparison works correctly.
        const machine = await MachineModel.findOne({ agentId: payload.machineId }).lean();
        const resolvedMachineId = machine ? machine._id.toString() : payload.machineId;

        const { emitResetEvent } = await import('../reset.events');
        emitResetEvent(payload.sessionId, {
          type: msg.type as 'reset_progress' | 'reset_complete',
          machineId: resolvedMachineId,
          machineName: payload.machineName ?? machine?.name,
          phase: payload.phase,
          message: payload.message,
          success: payload.success,
          error: payload.error,
        });
        logger.info('[WSManager] Reset event forwarded to SSE', {
          agentId,
          type: msg.type,
          sessionId: payload.sessionId,
          phase: payload.phase,
          success: payload.success,
        });
      }

      if (msg.type === 'clone_progress' || msg.type === 'clone_complete') {
        const payload = msg.payload as {
          sessionId: string;
          machineId: string;
          phase?: number;
          message?: string;
          success?: boolean;
          error?: string;
        };
        const machine = await MachineModel.findOne({ agentId: payload.machineId }).lean();
        const resolvedMachineId = machine ? machine._id.toString() : payload.machineId;

        const { emitCloneEvent } = await import('../clone.events');
        emitCloneEvent(payload.sessionId, {
          type: msg.type as 'clone_progress' | 'clone_complete',
          machineId: resolvedMachineId,
          phase: payload.phase,
          message: payload.message,
          success: payload.success,
          error: payload.error,
        });
        logger.info('[WSManager] Clone event forwarded to SSE', {
          agentId,
          type: msg.type,
          sessionId: payload.sessionId,
          phase: payload.phase,
          success: payload.success,
        });
      }
    } catch {
      logger.warn('[WSManager] Malformed message from agent', { agentId });
    }
  }

  private handleDisconnect(agentId: string, code: number, reason: string): void {
    const conn = this.connections.get(agentId);
    if (!conn) return;

    clearInterval(conn.pingTimer);
    clearTimeout(conn.pongDeadlineTimer);
    this.connections.delete(agentId);

    // Mark offline in DB
    MachineModel.updateOne({ agentId }, { status: 'offline' }).catch((err: Error) => {
      logger.error('[WSManager] Failed to mark agent offline', { agentId, error: err.message });
    });

    logger.info('[WSManager] Agent disconnected', { agentId, code, reason, totalConnections: this.connections.size });
  }

  private async markStaleAgentsOffline(): Promise<void> {
    const threshold = new Date(Date.now() - 3 * 60 * 1000); // 3 minutes ago
    const result = await MachineModel.updateMany(
      { status: 'online', lastSeen: { $lt: threshold }, deleted: { $ne: true } },
      { status: 'offline' }
    );
    if (result.modifiedCount > 0) {
      logger.info('[WSManager] Marked stale agents offline', { count: result.modifiedCount });
    }
  }
}

export const wsManager = new WSManager();
