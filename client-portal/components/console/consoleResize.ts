/** Ignore sub-pixel/rounding drift when comparing dimensions. */
export const DIMENSION_MATCH_TOLERANCE_PX = 4;

/** Wait until the user stops dragging/resizing before considering a refetch. */
export const RESIZE_REFETCH_DEBOUNCE_MS = 600;

/** Min delta before reconnecting is worth the last-wins takeover flash. */
export const RESIZE_REFETCH_MIN_DELTA_PX = 80;

/** Suppress resize refetch while entering/exiting fullscreen. */
export const FULLSCREEN_TRANSITION_GUARD_MS = 800;

export interface ConsoleDimensions {
  width?: number;
  height?: number;
}

export function dimensionsDrifted(a: ConsoleDimensions, b: ConsoleDimensions): boolean {
  if (a.width === undefined || a.height === undefined) return false;
  if (b.width === undefined || b.height === undefined) return false;
  return (
    Math.abs(a.width - b.width) > DIMENSION_MATCH_TOLERANCE_PX ||
    Math.abs(a.height - b.height) > DIMENSION_MATCH_TOLERANCE_PX
  );
}

export function dimensionsChangedSignificantly(
  a: ConsoleDimensions,
  b: ConsoleDimensions,
  minDelta = RESIZE_REFETCH_MIN_DELTA_PX
): boolean {
  if (a.width === undefined || a.height === undefined) return false;
  if (b.width === undefined || b.height === undefined) return false;
  return (
    Math.abs(a.width - b.width) > minDelta || Math.abs(a.height - b.height) > minDelta
  );
}

export function shouldRefetchSessionOnResize(
  current: ConsoleDimensions,
  lastFetched: ConsoleDimensions,
  options: { inFullscreen: boolean; inFullscreenTransition: boolean }
): boolean {
  if (options.inFullscreen || options.inFullscreenTransition) return false;
  return dimensionsChangedSignificantly(current, lastFetched);
}

export function markFullscreenTransitionUntil(now = Date.now()): number {
  return now + FULLSCREEN_TRANSITION_GUARD_MS;
}

export function isFullscreenTransitionActive(transitionUntilMs: number, now = Date.now()): boolean {
  return now < transitionUntilMs;
}
