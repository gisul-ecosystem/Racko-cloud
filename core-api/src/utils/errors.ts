export class AppError extends Error {
  public readonly statusCode: number;
  public readonly code: string;
  public readonly isOperational: boolean;

  constructor(message: string, statusCode: number, code: string, isOperational = true) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    this.isOperational = isOperational;
    Object.setPrototypeOf(this, new.target.prototype);
    Error.captureStackTrace(this, this.constructor);
  }
}

export class ValidationError extends AppError {
  constructor(message: string) {
    super(message, 400, 'VALIDATION_ERROR');
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = 'Unauthorized') {
    super(message, 401, 'UNAUTHORIZED');
  }
}

export class ForbiddenError extends AppError {
  constructor(message = 'Forbidden') {
    super(message, 403, 'FORBIDDEN');
  }
}

export class NotFoundError extends AppError {
  constructor(message = 'Resource not found') {
    super(message, 404, 'NOT_FOUND');
  }
}

export class ConflictError extends AppError {
  constructor(message: string) {
    super(message, 409, 'CONFLICT');
  }
}

export class TooManyRequestsError extends AppError {
  constructor(message = 'Too many requests') {
    super(message, 429, 'TOO_MANY_REQUESTS');
  }
}

export class InternalError extends AppError {
  constructor(message = 'Internal server error') {
    super(message, 500, 'INTERNAL_ERROR', false);
  }
}

export class AccountLockedError extends AppError {
  public readonly lockedUntil: Date;

  constructor(lockedUntil: Date) {
    const minutesRemaining = Math.ceil((lockedUntil.getTime() - Date.now()) / 60000);
    super(
      `Account temporarily locked. Try again in ${minutesRemaining} minute(s).`,
      423,
      'ACCOUNT_LOCKED'
    );
    this.lockedUntil = lockedUntil;
  }
}

export class EmailNotVerifiedError extends AppError {
  constructor() {
    super(
      'Please verify your email address before logging in. Check your inbox for the verification link.',
      403,
      'EMAIL_NOT_VERIFIED'
    );
  }
}

// ─── Proxmox infrastructure errors ───────────────────────────────────────────

/**
 * Thrown when Proxmox is unreachable (network error, timeout, 500).
 * Client receives a safe generic message — internal IP never exposed.
 */
export class ProxmoxConnectionError extends AppError {
  constructor(internalMessage: string, endpoint?: string) {
    super('Infrastructure service temporarily unavailable.', 503, 'PROXMOX_UNAVAILABLE');
    // Log full details internally only — never surfaced to client
    void internalMessage;
    void endpoint;
  }
}

/**
 * Thrown when Proxmox returns 401 or 403 (bad token / insufficient permissions).
 * Client receives a safe generic message — token details never exposed.
 */
export class ProxmoxAuthError extends AppError {
  constructor(internalMessage: string, endpoint?: string) {
    super('Infrastructure authentication error.', 502, 'PROXMOX_AUTH_ERROR');
    void internalMessage;
    void endpoint;
  }
}

/**
 * Thrown when a requested node name does not exist in the cluster.
 */
export class ProxmoxNodeNotFoundError extends AppError {
  constructor(nodeName: string) {
    super(`Node '${nodeName}' not found.`, 404, 'PROXMOX_NODE_NOT_FOUND');
  }
}
