/** Primary CTA — uses tenant `--cloud-accent` when set (TenantServiceShell), else Racko red. */
export const RACKO_BTN_PRIMARY =
  'inline-flex items-center justify-center gap-2 rounded-lg bg-[var(--cloud-accent,#B91C1C)] px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-[var(--cloud-accent,#B91C1C)]/30 focus:ring-offset-2 disabled:opacity-50';

export const RACKO_BTN_SECONDARY =
  'inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-600 transition hover:border-gray-300 hover:bg-gray-50 disabled:opacity-40';

export const RACKO_LINK_ACCENT =
  'text-sm font-medium text-[var(--cloud-accent,#B91C1C)] transition hover:opacity-80';
