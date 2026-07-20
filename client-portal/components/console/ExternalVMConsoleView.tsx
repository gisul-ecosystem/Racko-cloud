'use client';

import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { ChevronLeft, Maximize, RefreshCw, LogOut } from 'lucide-react';
import {
  fetchExternalVM,
  getExternalVMConsole,
  type ExternalVMConsoleSession,
  type ExternalVMProtocol,
} from '../../lib/externalVmApi';
import { ApiError } from '../../lib/apiClient';

const TOOLBAR_HEIGHT = 44;
/** Minimum time the Racko overlay stays up (iframe onLoad fires much earlier). */
const IFRAME_OVERLAY_MIN_MS = 5000;
/** Hard cap so a stuck iframe cannot block the console forever. */
const IFRAME_OVERLAY_MAX_MS = 12000;
const IFRAME_OVERLAY_FADE_MS = 300;

const protocolColors: Record<ExternalVMProtocol, { bg: string; border: string; text: string }> = {
  rdp: { bg: 'rgba(59, 130, 246, 0.15)', border: 'rgba(59, 130, 246, 0.4)', text: '#93c5fd' },
  ssh: { bg: 'rgba(34, 197, 94, 0.15)', border: 'rgba(34, 197, 94, 0.4)', text: '#86efac' },
};

function getProtocolSubtitle(p: ExternalVMProtocol): string {
  return p === 'ssh' ? 'Establishing secure SSH session' : 'Establishing secure RDP session';
}

/** Ignore sub-pixel/rounding drift so we don't loop re-fetching forever. */
const DIMENSION_MATCH_TOLERANCE_PX = 4;

function dimensionsDrifted(
  a: { width?: number; height?: number },
  b: { width?: number; height?: number }
): boolean {
  if (a.width === undefined || a.height === undefined) return false;
  if (b.width === undefined || b.height === undefined) return false;
  return (
    Math.abs(a.width - b.width) > DIMENSION_MATCH_TOLERANCE_PX ||
    Math.abs(a.height - b.height) > DIMENSION_MATCH_TOLERANCE_PX
  );
}

export interface ExternalVMConsoleViewProps {
  backHref: string;
  disconnectHref: string;
  /** Defaults to platform admin external-vms APIs. */
  fetchVm?: (id: string) => Promise<{ name: string }>;
  openConsole?: (
    id: string,
    dimensions?: { width?: number; height?: number }
  ) => Promise<ExternalVMConsoleSession>;
}

/**
 * Browser console viewer for external ("Elastic") VMs.
 *
 * Mirrors VMConsoleView (VPS) but for external servers:
 *  - calls getExternalVMConsole(id) instead of the VPS console endpoint
 *  - shows the external VM name in the toolbar
 *  - no "VM must be running" check and no consoleReady / IP-polling gate
 */
export function ExternalVMConsoleView({
  backHref,
  disconnectHref,
  fetchVm = fetchExternalVM,
  openConsole = getExternalVMConsole,
}: ExternalVMConsoleViewProps) {
  const params = useParams<{ id?: string; serverId?: string }>();
  const id = params.id ?? params.serverId;
  const router = useRouter();

  const [session, setSession] = useState<ExternalVMConsoleSession | null>(null);
  const hasSessionRef = useRef(false);
  const [vmName, setVmName] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [iframeKey, setIframeKey] = useState(0);
  const [iframeLoading, setIframeLoading] = useState(false);
  const [overlayMounted, setOverlayMounted] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);

  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const iframeTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const overlayStartedAtRef = useRef(0);
  /** Dimensions actually sent with the last console-session request. */
  const lastFetchDimsRef = useRef<{ width?: number; height?: number }>({});
  /** Prevents overlapping fetches when onLoad-recheck and ResizeObserver fire close together. */
  const isFetchingRef = useRef(false);
  const resizeDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** Mirrors isFullscreen for reads inside stable closures (ResizeObserver callback). */
  const isFullscreenRef = useRef(false);

  /**
   * Prefer the iframe's actual container box over window.innerWidth/innerHeight
   * so Guacamole renders at the real on-screen resolution — no scaling, no
   * black bars, no need to go fullscreen first. Falls back to window size
   * before the container has been measured (e.g. the very first fetch, when
   * no <iframe> has mounted yet).
   *
   * requestFullscreen() is called on the <iframe> itself (see handleFullscreen),
   * not on its parent container — the browser resizes the fullscreen element
   * to fill the viewport, but the parent div's clientWidth/clientHeight stay
   * at their pre-fullscreen size. So while fullscreen, go straight to
   * window.innerWidth/innerHeight instead of measuring the (stale) container.
   */
  const getContainerDimensions = useCallback((): { width?: number; height?: number } => {
    if (isFullscreenRef.current) {
      return { width: window.innerWidth, height: window.innerHeight };
    }
    const container = iframeRef.current?.parentElement ?? containerRef.current;
    const width = container?.clientWidth ?? window.innerWidth;
    const height = container?.clientHeight ?? window.innerHeight;
    return { width, height };
  }, []);

  const clearIframeTimeout = useCallback(() => {
    if (iframeTimeoutRef.current) {
      clearTimeout(iframeTimeoutRef.current);
      iframeTimeoutRef.current = null;
    }
  }, []);

  const scheduleOverlayHide = useCallback(
    (delayMs: number) => {
      clearIframeTimeout();
      iframeTimeoutRef.current = setTimeout(() => {
        setIframeLoading(false);
        iframeTimeoutRef.current = null;
      }, delayMs);
    },
    [clearIframeTimeout]
  );

  const startIframeLoading = useCallback(() => {
    overlayStartedAtRef.current = Date.now();
    setIframeLoading(true);
    setOverlayMounted(true);
    scheduleOverlayHide(IFRAME_OVERLAY_MAX_MS);
  }, [scheduleOverlayHide]);

  const fetchSession = useCallback(
    async (signal?: AbortSignal) => {
      if (!id) return;
      if (isFetchingRef.current) return;
      isFetchingRef.current = true;
      setLoading(true);
      setError(null);
      try {
        const dims = getContainerDimensions();
        lastFetchDimsRef.current = dims;
        const data = await openConsole(id, dims);
        if (signal?.aborted) return;
        setSession(data);
        setIframeKey((k) => k + 1);
      } catch (err) {
        if (signal?.aborted) return;
        setError(
          err instanceof ApiError
            ? err.message
            : 'Failed to start console session. Please try again.'
        );
      } finally {
        isFetchingRef.current = false;
        if (!signal?.aborted) setLoading(false);
      }
    },
    [id, openConsole, getContainerDimensions]
  );

  useEffect(() => {
    const ctrl = new AbortController();
    void fetchSession(ctrl.signal);
    return () => ctrl.abort();
  }, [fetchSession]);

  useEffect(() => {
    hasSessionRef.current = !!session;
  }, [session]);

  // Resolve the VM name for the toolbar title (best-effort, non-blocking).
  useEffect(() => {
    if (!id) return;
    const ctrl = new AbortController();
    fetchVm(id)
      .then((vm) => {
        if (!ctrl.signal.aborted) setVmName(vm.name);
      })
      .catch(() => {
        // Name is cosmetic — fall back to the short id if it can't be fetched.
      });
    return () => ctrl.abort();
  }, [id, fetchVm]);

  useEffect(() => {
    if (!session) return;
    startIframeLoading();
    return () => clearIframeTimeout();
  }, [session, iframeKey, startIframeLoading, clearIframeTimeout]);

  // Keep the console sized to its container — if the container is resized
  // (window resize, sidebar toggle, panel drag, etc.), re-request the session
  // with the new dimensions and reload the iframe so Guacamole re-renders at
  // the correct resolution instead of scaling/letterboxing.
  useEffect(() => {
    const container = containerRef.current;
    if (!container || typeof ResizeObserver === 'undefined') return;

    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      const { width, height } = entry.contentRect;

      if (resizeDebounceRef.current) clearTimeout(resizeDebounceRef.current);
      resizeDebounceRef.current = setTimeout(() => {
        if (isFullscreenRef.current) return; // entering/inside fullscreen isn't a real resize — don't reload
        if (!hasSessionRef.current) return; // no active session yet — initial fetch will size correctly
        if (dimensionsDrifted({ width, height }, lastFetchDimsRef.current)) {
          void fetchSession();
        }
      }, 400);
    });

    observer.observe(container);
    return () => {
      observer.disconnect();
      if (resizeDebounceRef.current) {
        clearTimeout(resizeDebounceRef.current);
        resizeDebounceRef.current = null;
      }
    };
  }, [fetchSession]);

  useEffect(() => {
    if (!iframeLoading && overlayMounted) {
      const timer = setTimeout(() => setOverlayMounted(false), IFRAME_OVERLAY_FADE_MS);
      return () => clearTimeout(timer);
    }
  }, [iframeLoading, overlayMounted]);

  const handleIframeLoad = () => {
    const elapsed = Date.now() - overlayStartedAtRef.current;
    const remainingMin = Math.max(0, IFRAME_OVERLAY_MIN_MS - elapsed);
    const remainingMax = Math.max(0, IFRAME_OVERLAY_MAX_MS - elapsed);
    scheduleOverlayHide(Math.min(remainingMin, remainingMax));
    iframeRef.current?.focus();

    // The container may not have been laid out yet when we requested this
    // session (flex layout settling, fonts affecting toolbar height, etc.).
    // Now that the iframe has actually rendered, re-check against the real
    // container size and self-correct if it drifted from what we requested.
    // Skip while fullscreen — entering fullscreen changes the container size
    // on purpose and should never trigger a reload.
    if (isFullscreenRef.current) return;
    const currentDims = getContainerDimensions();
    if (dimensionsDrifted(currentDims, lastFetchDimsRef.current)) {
      void fetchSession();
    }
  };

  useEffect(() => {
    if (!session) return;
    const timer = setTimeout(() => iframeRef.current?.focus(), 500);
    return () => clearTimeout(timer);
  }, [session, iframeKey]);

  useEffect(() => {
    const handleFullscreenChange = () => {
      const nowFullscreen = !!document.fullscreenElement;
      isFullscreenRef.current = nowFullscreen;
      setIsFullscreen(nowFullscreen);

      if (nowFullscreen) {
        // Entering fullscreen — re-fetch so getContainerDimensions() picks up
        // window.innerWidth/innerHeight (the iframe's container now IS the
        // full screen). The delay lets the browser finish the fullscreen
        // transition before we measure.
        setTimeout(() => {
          if (isFullscreenRef.current) void fetchSession();
        }, 300);
      } else {
        // Exiting fullscreen — re-fetch so Guacamole shrinks back down to
        // the real (non-fullscreen) container size instead of staying
        // scaled/letterboxed at the old fullscreen resolution.
        setTimeout(() => {
          if (!isFullscreenRef.current) void fetchSession();
        }, 300);
      }

      setTimeout(() => iframeRef.current?.focus(), 300);
    };
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    document.addEventListener('webkitfullscreenchange', handleFullscreenChange);
    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
      document.removeEventListener('webkitfullscreenchange', handleFullscreenChange);
    };
  }, [fetchSession]);

  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        setTimeout(() => iframeRef.current?.focus(), 200);
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, []);

  const handleFullscreen = () => {
    const el = iframeRef.current;
    if (!el || typeof el.requestFullscreen !== 'function') return;
    el.requestFullscreen()
      .then(() => setTimeout(() => iframeRef.current?.focus(), 300))
      .catch(() => {
        // ignore — user dismissed or browser blocked
      });
  };

  const protocol = session?.protocol ?? 'rdp';
  const badge = protocolColors[protocol];
  const displayName = vmName ?? (id ? `· ${id.slice(-6)}` : '');

  return (
    <div style={styles.root}>
      <div style={styles.toolbar}>
        <div style={styles.toolbarLeft}>
          <button
            type="button"
            onClick={() => router.push(backHref)}
            style={styles.iconButton}
            title="Back"
            aria-label="Back"
          >
            <ChevronLeft size={16} />
          </button>
          <span style={styles.vmLabel}>{displayName}</span>
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
            onClick={() => void fetchSession()}
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
            onClick={() => router.push(disconnectHref)}
            style={styles.disconnectButton}
            title="Disconnect and return"
          >
            <LogOut size={13} />
            Disconnect
          </button>
        </div>
      </div>

      <div ref={containerRef} style={styles.body} onClick={() => iframeRef.current?.focus()}>
        {loading && !session && (
          <div style={styles.statusOverlay}>
            <div style={styles.spinner} />
            <p style={styles.statusText}>Starting console session…</p>
          </div>
        )}

        {error && !loading && (
          <div style={styles.statusOverlay}>
            <p style={styles.errorText}>{error}</p>
            <button type="button" onClick={() => void fetchSession()} style={styles.tryAgainButton}>
              Try Again
            </button>
          </div>
        )}

        {session && !error && (
          <>
            <iframe
              key={iframeKey}
              ref={iframeRef}
              src={session.clientUrl}
              title={`External VM console (${protocol})`}
              style={styles.iframe}
              allow="clipboard-read; clipboard-write; fullscreen"
              allowFullScreen
              tabIndex={0}
              onLoad={handleIframeLoad}
              onClick={() => iframeRef.current?.focus()}
            />

            {overlayMounted && (
              <div
                style={{
                  ...styles.iframeOverlay,
                  opacity: iframeLoading ? 1 : 0,
                  pointerEvents: iframeLoading ? 'auto' : 'none',
                }}
                aria-hidden={!iframeLoading}
                aria-live="polite"
              >
                <div style={styles.spinner} />
                <p style={styles.connectingTitle}>Connecting to server...</p>
                <p style={styles.connectingSubtitle}>{getProtocolSubtitle(protocol)}</p>
                {vmName && <p style={styles.connectingVmLabel}>{vmName}</p>}
              </div>
            )}
          </>
        )}
      </div>

      <style>{`
        @keyframes rackoSpin {
          from { transform: rotate(0deg); }
          to   { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}

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
  toolbarLeft: { display: 'flex', alignItems: 'center', gap: 10 },
  toolbarRight: { display: 'flex', alignItems: 'center', gap: 6 },
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
    maxWidth: 280,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
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
  body: { flex: 1, position: 'relative', background: '#0a0a0f', overflow: 'hidden' },
  iframe: { width: '100%', height: '100%', border: 'none', display: 'block', background: '#000' },
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
  statusText: { fontSize: 13, color: '#94a3b8', margin: 0 },
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
  iframeOverlay: {
    position: 'absolute',
    inset: 0,
    zIndex: 10,
    background: '#0A0F1E',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 14,
    transition: 'opacity 0.3s ease',
  },
  connectingTitle: { fontSize: 16, color: '#ffffff', margin: 0, fontWeight: 500 },
  connectingSubtitle: { fontSize: 13, color: '#94a3b8', margin: 0 },
  connectingVmLabel: {
    fontSize: 11,
    color: '#64748b',
    margin: 0,
    marginTop: 4,
    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
  },
};
