'use client';

import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { ChevronLeft, Maximize, RefreshCw, LogOut } from 'lucide-react';
import {
  closeConsoleSession,
  getConsoleSession,
  type ConsoleProtocol,
  type ConsoleSession,
} from '../../../../../../lib/consoleApi';
import { ApiError } from '../../../../../../lib/apiClient';

/**
 * Full-screen VM console powered by Guacamole.
 *
 * URL: /dashboard/admin/vms/<vmId>/console?protocol=rdp|ssh|vnc
 *
 * Renders an iframe pointed at the Guacamole web app via the public
 * (nginx-proxied) URL returned by core-api. The iframe URL contains a
 * hash fragment — it must be passed directly to <iframe src> without
 * encoding or routing through next/navigation.
 */

const TOOLBAR_HEIGHT = 44;

const protocolColors: Record<ConsoleProtocol, { bg: string; border: string; text: string }> = {
  rdp: { bg: 'rgba(59, 130, 246, 0.15)', border: 'rgba(59, 130, 246, 0.4)', text: '#93c5fd' },
  ssh: { bg: 'rgba(34, 197, 94, 0.15)', border: 'rgba(34, 197, 94, 0.4)', text: '#86efac' },
  vnc: { bg: 'rgba(249, 115, 22, 0.15)', border: 'rgba(249, 115, 22, 0.4)', text: '#fdba74' },
};

function parseProtocol(raw: string | null): ConsoleProtocol {
  if (raw === 'ssh' || raw === 'vnc' || raw === 'rdp') return raw;
  return 'rdp';
}

export default function VMConsolePage() {
  const { vmId } = useParams<{ vmId: string }>();
  const router = useRouter();
  const searchParams = useSearchParams();
  const protocol = parseProtocol(searchParams.get('protocol'));

  const [session, setSession] = useState<ConsoleSession | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [iframeKey, setIframeKey] = useState(0);

  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const sessionRef = useRef<ConsoleSession | null>(null);

  const fetchSession = useCallback(
    async (signal?: AbortSignal) => {
      if (!vmId) return;
      setLoading(true);
      setError(null);
      try {
        const data = await getConsoleSession(vmId, protocol);
        if (signal?.aborted) return;
        setSession(data);
        sessionRef.current = data;
        setIframeKey((k) => k + 1);
      } catch (err) {
        if (signal?.aborted) return;
        setError(
          err instanceof ApiError
            ? err.message
            : 'Failed to start console session. Please try again.'
        );
      } finally {
        if (!signal?.aborted) setLoading(false);
      }
    },
    [vmId, protocol]
  );

  useEffect(() => {
    const ctrl = new AbortController();
    void fetchSession(ctrl.signal);
    return () => {
      ctrl.abort();
      const cached = sessionRef.current;
      if (cached) {
        void closeConsoleSession(cached.connectionId);
      }
    };
  }, [fetchSession]);

  // Focus the iframe once it has mounted so keyboard events reach Guacamole.
  // Mouse events work without focus, but keydown is delivered only to the
  // currently-focused element. Small delay lets the iframe document settle.
  useEffect(() => {
    if (!session) return;
    const timer = setTimeout(() => {
      iframeRef.current?.focus();
    }, 500);
    return () => clearTimeout(timer);
  }, [session, iframeKey]);

  const handleReconnect = () => {
    void fetchSession();
  };

  const handleFullscreen = () => {
    const el = iframeRef.current;
    if (!el) return;
    if (typeof el.requestFullscreen === 'function') {
      void el.requestFullscreen();
    }
  };

  const handleDisconnect = () => {
    const cached = sessionRef.current;
    if (cached) void closeConsoleSession(cached.connectionId);
    router.push('/dashboard/admin/vms');
  };

  const handleBack = () => {
    const cached = sessionRef.current;
    if (cached) void closeConsoleSession(cached.connectionId);
    router.push(`/dashboard/admin/vms/${vmId}`);
  };

  const badge = protocolColors[protocol];

  return (
    <div style={styles.root}>
      {/* Toolbar */}
      <div style={styles.toolbar}>
        <div style={styles.toolbarLeft}>
          <button
            type="button"
            onClick={handleBack}
            style={styles.iconButton}
            title="Back to VM details"
            aria-label="Back to VM details"
          >
            <ChevronLeft size={16} />
          </button>
          <span style={styles.vmLabel}>VM {vmId ? `· ${vmId.slice(-6)}` : ''}</span>
          <span
            style={{
              ...styles.protocolBadge,
              background: badge.bg,
              borderColor: badge.border,
              color: badge.text,
            }}
          >
            {protocol.toUpperCase()}
          </span>
        </div>

        <div style={styles.toolbarRight}>
          <button
            type="button"
            onClick={handleReconnect}
            disabled={loading}
            style={{
              ...styles.textButton,
              opacity: loading ? 0.4 : 1,
              cursor: loading ? 'not-allowed' : 'pointer',
            }}
            title="Reconnect the console session"
          >
            <RefreshCw
              size={13}
              style={loading ? { animation: 'rackoSpin 1s linear infinite' } : undefined}
            />
            Reconnect
          </button>
          <button
            type="button"
            onClick={handleFullscreen}
            disabled={!session}
            style={{
              ...styles.textButton,
              opacity: !session ? 0.4 : 1,
              cursor: !session ? 'not-allowed' : 'pointer',
            }}
            title="Enter fullscreen"
          >
            <Maximize size={13} />
            Fullscreen
          </button>
          <button
            type="button"
            onClick={handleDisconnect}
            style={styles.disconnectButton}
            title="Disconnect and return to VM list"
          >
            <LogOut size={13} />
            Disconnect
          </button>
        </div>
      </div>

      {/* Body */}
      <div
        style={styles.body}
        onClick={() => iframeRef.current?.focus()}
      >
        {loading && !session && (
          <div style={styles.statusOverlay}>
            <div style={styles.spinner} />
            <p style={styles.statusText}>Starting console session…</p>
          </div>
        )}

        {error && !loading && (
          <div style={styles.statusOverlay}>
            <p style={styles.errorText}>{error}</p>
            <button type="button" onClick={handleReconnect} style={styles.tryAgainButton}>
              Try Again
            </button>
          </div>
        )}

        {session && !error && (
          <iframe
            key={iframeKey}
            ref={iframeRef}
            src={session.clientUrl}
            title={`VM console (${protocol})`}
            style={styles.iframe}
            allow="clipboard-read; clipboard-write; fullscreen"
            allowFullScreen
            tabIndex={0}
            onLoad={() => iframeRef.current?.focus()}
            onClick={() => iframeRef.current?.focus()}
          />
        )}
      </div>

      {/* Spinner keyframes (inline so we don't rely on global CSS) */}
      <style>{`
        @keyframes rackoSpin {
          from { transform: rotate(0deg); }
          to   { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}

// ─── Inline styles ────────────────────────────────────────────────────────────
// Using inline styles per spec — also lets the console overlay the dashboard
// sidebar (the dashboard layout otherwise pushes content right by 240px).

const styles: Record<string, CSSProperties> = {
  root: {
    position: 'fixed',
    inset: 0,
    background: '#0a0a0f',
    zIndex: 9999,
    display: 'flex',
    flexDirection: 'column',
    fontFamily:
      "ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
  },
  toolbar: {
    height: TOOLBAR_HEIGHT,
    minHeight: TOOLBAR_HEIGHT,
    background: '#0f0f1a',
    color: '#e2e8f0',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '0 12px',
    borderBottom: '1px solid #1f2937',
  },
  toolbarLeft: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
  },
  toolbarRight: {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
  },
  iconButton: {
    background: 'transparent',
    border: '1px solid transparent',
    color: '#e2e8f0',
    cursor: 'pointer',
    padding: '6px 8px',
    borderRadius: 6,
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  vmLabel: {
    fontSize: 12,
    color: '#94a3b8',
    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
  },
  protocolBadge: {
    fontSize: 10,
    fontWeight: 600,
    letterSpacing: 0.5,
    border: '1px solid',
    padding: '2px 8px',
    borderRadius: 999,
  },
  textButton: {
    background: 'transparent',
    border: '1px solid rgba(148, 163, 184, 0.2)',
    color: '#e2e8f0',
    fontSize: 12,
    padding: '6px 10px',
    borderRadius: 6,
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
  },
  disconnectButton: {
    background: 'rgba(239, 68, 68, 0.15)',
    border: '1px solid rgba(239, 68, 68, 0.4)',
    color: '#fca5a5',
    fontSize: 12,
    padding: '6px 10px',
    borderRadius: 6,
    cursor: 'pointer',
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
  },
  body: {
    flex: 1,
    position: 'relative',
    background: '#0a0a0f',
    overflow: 'hidden',
  },
  iframe: {
    width: '100%',
    height: '100%',
    border: 'none',
    display: 'block',
    background: '#000',
  },
  statusOverlay: {
    position: 'absolute',
    inset: 0,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 14,
    color: '#cbd5e1',
  },
  spinner: {
    width: 32,
    height: 32,
    border: '3px solid rgba(148, 163, 184, 0.2)',
    borderTopColor: '#60a5fa',
    borderRadius: '50%',
    animation: 'rackoSpin 0.9s linear infinite',
  },
  statusText: {
    fontSize: 13,
    color: '#94a3b8',
    margin: 0,
  },
  errorText: {
    fontSize: 13,
    color: '#fca5a5',
    margin: 0,
    maxWidth: 480,
    textAlign: 'center',
    padding: '0 16px',
  },
  tryAgainButton: {
    background: '#1e40af',
    color: '#fff',
    border: 'none',
    padding: '8px 16px',
    borderRadius: 6,
    fontSize: 13,
    cursor: 'pointer',
  },
};
