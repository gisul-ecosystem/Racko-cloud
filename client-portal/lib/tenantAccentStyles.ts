import type { CSSProperties } from 'react';

/** Convert #RGB or #RRGGBB to rgba(); falls back to neutral gray if invalid. */
export function hexToRgba(hex: string, alpha: number): string {
  const normalized = hex.replace('#', '').trim();
  const full =
    normalized.length === 3
      ? normalized
          .split('')
          .map((c) => c + c)
          .join('')
      : normalized;

  if (full.length !== 6 || !/^[0-9a-fA-F]{6}$/.test(full)) {
    return `rgba(17, 24, 39, ${alpha})`;
  }

  const r = parseInt(full.slice(0, 2), 16);
  const g = parseInt(full.slice(2, 4), 16);
  const b = parseInt(full.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/** Light tinted surface + accent border (nav tabs, icon boxes, selected cards). */
export function tenantAccentSurface(accentColor: string, alpha = 0.08): CSSProperties {
  return {
    backgroundColor: hexToRgba(accentColor, alpha),
    borderColor: accentColor,
  };
}

/** Selected card / tile with accent ring. */
export function tenantAccentSelectedBox(accentColor: string): CSSProperties {
  return {
    borderColor: accentColor,
    backgroundColor: hexToRgba(accentColor, 0.08),
    boxShadow: `0 0 0 1px ${accentColor}`,
  };
}

/** Primary action button — accent background, white label. */
export function tenantAccentButton(accentColor: string): CSSProperties {
  return { backgroundColor: accentColor };
}

/** Active tab underline + label color. */
export function tenantAccentTabActive(accentColor: string): CSSProperties {
  return {
    borderColor: accentColor,
    color: accentColor,
  };
}

/** Selected toggle / segmented control option. */
export function tenantAccentToggleActive(accentColor: string): CSSProperties {
  return {
    borderColor: accentColor,
    backgroundColor: hexToRgba(accentColor, 0.1),
    color: accentColor,
  };
}

/** Text links and inline accents. */
export function tenantAccentText(accentColor: string): CSSProperties {
  return { color: accentColor };
}

/** Focus ring for inputs (use with focus:ring-2). */
export function tenantAccentFocusRing(accentColor: string): CSSProperties {
  return { ['--tw-ring-color' as string]: accentColor };
}
