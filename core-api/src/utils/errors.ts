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

export class RegistrationUnavailableError extends AppError {
  constructor() {
    super(
      'Sorry, we could not complete your registration right now. Please try again later or sign in if you already have an account.',
      409,
      'REGISTRATION_UNAVAILABLE'
    );
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
  /** Detailed message for logs and Hyper-V `hyperVLastError` — not sent as the HTTP body. */
  public readonly internalMessage: string;
  public readonly httpStatus: number;
  /** Whether Hyper-V guest operations should retry (transient agent/network/5xx). */
  public readonly isRetryable: boolean;

  constructor(internalMessage: string, endpoint?: string, httpStatus = 0) {
    super('Infrastructure service temporarily unavailable.', 503, 'PROXMOX_UNAVAILABLE');
    this.internalMessage = internalMessage;
    this.httpStatus = httpStatus;
    const msg = internalMessage.toLowerCase();
    const agentFlake =
      /guest agent is not running|guest agent.*not available|agent exited with error/i.test(msg);
    if (httpStatus === 0 || httpStatus >= 500 || agentFlake) {
      this.isRetryable = true;
    } else if (httpStatus >= 400 && httpStatus < 500) {
      this.isRetryable = false;
    } else {
      this.isRetryable = true;
    }
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

// ─── VM management errors ─────────────────────────────────────────────────────

/**
 * Thrown when cluster resources are insufficient to fulfill a VM creation request.
 * HTTP 422 — includes max possible count so frontend can inform the user.
 */
export class InsufficientResourcesError extends AppError {
  public readonly requestedCount: number;
  public readonly maxPossibleCount: number;
  public readonly bottleneck: string;

  constructor(
    message: string,
    requestedCount: number,
    maxPossibleCount: number,
    bottleneck: string
  ) {
    super(message, 422, 'INSUFFICIENT_RESOURCES');
    this.requestedCount = requestedCount;
    this.maxPossibleCount = maxPossibleCount;
    this.bottleneck = bottleneck;
  }
}

/**
 * Thrown when a VM record is not found in MongoDB.
 * HTTP 404
 */
export class VMNotFoundError extends AppError {
  constructor(message = 'VM not found.') {
    super(message, 404, 'VM_NOT_FOUND');
  }
}

/**
 * Thrown when an admin attempts to access another admin's VM.
 * HTTP 403
 */
export class VMOwnershipError extends AppError {
  constructor(message = 'You do not have permission to access this VM.') {
    super(message, 403, 'VM_OWNERSHIP_ERROR');
  }
}

/**
 * Thrown when a VM operation is invalid for the current VM state.
 * e.g. trying to start an already running VM.
 * HTTP 422
 */
export class VMOperationError extends AppError {
  public readonly currentState: string;
  public readonly requiredState: string;

  constructor(message: string, currentState: string, requiredState: string) {
    super(message, 422, 'VM_OPERATION_ERROR');
    this.currentState = currentState;
    this.requiredState = requiredState;
  }
}

/**
 * Thrown when a user tries to start/stop/restart a VM on an active automation schedule.
 * HTTP 403
 */
export class AutomationPowerRestrictedError extends AppError {
  constructor() {
    super(
      'This VM is on an automated lab schedule. Start, stop, and restart are managed for you.',
      403,
      'AUTOMATION_POWER_RESTRICTED'
    );
  }
}

/**
 * Thrown when a Proxmox async task exceeds the configured timeout.
 * HTTP 504 Gateway Timeout
 */
export class TaskTimeoutError extends AppError {
  public readonly upid: string;

  constructor(message: string, upid: string) {
    super(message, 504, 'TASK_TIMEOUT');
    this.upid = upid;
  }
}

/**
 * Thrown when a requested Proxmox template is not found on any node.
 * HTTP 404
 */
export class TemplateNotFoundError extends AppError {
  constructor(message = 'Template not found.') {
    super(message, 404, 'TEMPLATE_NOT_FOUND');
  }
}
