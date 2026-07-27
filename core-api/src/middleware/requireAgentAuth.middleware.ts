import type { Request, Response, NextFunction } from 'express';
import { MachineModel } from '../modules/machine-manager/machine-manager.model';
import { UnauthorizedError } from '../utils/errors';

/**
 * Agent authentication middleware.
 *
 * Agent endpoints do not use JWT — agents authenticate with their unique
 * agentId issued at registration time, sent via the X-Agent-ID header.
 *
 * This is the same pattern used by Datadog, Elastic Agent, and New Relic:
 * a unique per-machine identity token, no user session involved.
 *
 * Validates:
 *   1. X-Agent-ID header is present
 *   2. A non-deleted machine with that agentId exists in the DB
 *
 * Attaches nothing to req — the controller reads X-Agent-ID directly.
 * Keeps the middleware lightweight (single DB lookup, indexed on agentId).
 */
export async function requireAgentAuth(
  req: Request,
  _res: Response,
  next: NextFunction
): Promise<void> {
  const agentId = req.headers['x-agent-id'] as string | undefined;

  if (!agentId || agentId.trim() === '') {
    return next(new UnauthorizedError('X-Agent-ID header is required.'));
  }

  try {
    const machine = await MachineModel.findOne(
      { agentId, deleted: { $ne: true } },
      { _id: 1 }   // projection — only fetch _id, fastest possible lookup
    ).lean();

    if (!machine) {
      return next(new UnauthorizedError('Unknown agent ID.'));
    }

    next();
  } catch (err) {
    next(err);
  }
}
