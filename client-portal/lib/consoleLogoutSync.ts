export type ConsoleAuthScope = 'platform' | 'tenant';

interface ConsoleLogoutMessage {
  type: 'RACKO_CONSOLE_LOGOUT';
  id: string;
  scope: ConsoleAuthScope;
  issuedAt: number;
}

const CHANNEL_NAME = 'racko-console-auth';
const STORAGE_KEY = 'racko_console_logout';
const MAX_MESSAGE_AGE_MS = 30_000;

function createLogoutMessage(scope: ConsoleAuthScope): ConsoleLogoutMessage {
  return {
    type: 'RACKO_CONSOLE_LOGOUT',
    id:
      typeof crypto !== 'undefined' && 'randomUUID' in crypto
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(36).slice(2)}`,
    scope,
    issuedAt: Date.now(),
  };
}

function parseLogoutMessage(value: unknown): ConsoleLogoutMessage | null {
  if (!value || typeof value !== 'object') return null;
  const message = value as Partial<ConsoleLogoutMessage>;
  if (
    message.type !== 'RACKO_CONSOLE_LOGOUT' ||
    typeof message.id !== 'string' ||
    (message.scope !== 'platform' && message.scope !== 'tenant') ||
    typeof message.issuedAt !== 'number'
  ) {
    return null;
  }
  return message as ConsoleLogoutMessage;
}

/** Notify same-origin console tabs before the caller clears its Racko session. */
export function broadcastConsoleLogout(scope: ConsoleAuthScope): void {
  if (typeof window === 'undefined') return;
  const message = createLogoutMessage(scope);

  if (typeof BroadcastChannel !== 'undefined') {
    const channel = new BroadcastChannel(CHANNEL_NAME);
    channel.postMessage(message);
    channel.close();
  }

  // Fallback for browsers without BroadcastChannel. The storage event is
  // delivered to other tabs, not the tab that writes the value.
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(message));
  } catch {
    // Storage may be disabled; BroadcastChannel remains the primary path.
  }
}

/** Listen for logout in another tab. Returns an unsubscribe function. */
export function subscribeToConsoleLogout(
  scope: ConsoleAuthScope,
  onLogout: () => void
): () => void {
  if (typeof window === 'undefined') return () => undefined;

  let lastHandledId: string | null = null;
  const handle = (value: unknown) => {
    const message = parseLogoutMessage(value);
    if (
      !message ||
      message.scope !== scope ||
      message.id === lastHandledId ||
      Date.now() - message.issuedAt > MAX_MESSAGE_AGE_MS
    ) {
      return;
    }
    lastHandledId = message.id;
    onLogout();
  };

  const channel =
    typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel(CHANNEL_NAME) : null;
  if (channel) {
    channel.onmessage = (event: MessageEvent<unknown>) => handle(event.data);
  }

  const onStorage = (event: StorageEvent) => {
    if (event.key !== STORAGE_KEY || !event.newValue) return;
    try {
      handle(JSON.parse(event.newValue));
    } catch {
      // Ignore malformed storage messages.
    }
  };
  window.addEventListener('storage', onStorage);

  return () => {
    window.removeEventListener('storage', onStorage);
    channel?.close();
  };
}
