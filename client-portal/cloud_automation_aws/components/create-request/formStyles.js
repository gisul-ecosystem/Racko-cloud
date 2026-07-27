'use client';

export const inputClass =
  'w-full rounded-lg border border-gray-200 bg-white px-3 py-2.5 text-sm text-gray-900 shadow-sm transition placeholder:text-gray-400 focus:border-[var(--cloud-accent,#B91C1C)] focus:outline-none focus:ring-2 focus:ring-[var(--cloud-accent,#B91C1C)]/20';

export const labelClass =
  'mb-1.5 block text-xs font-semibold uppercase tracking-wide text-gray-500';

export const timeInputClass =
  'rounded-lg border border-gray-200 bg-white px-2 py-1.5 text-sm text-gray-900 shadow-sm transition focus:border-[var(--cloud-accent,#B91C1C)] focus:outline-none focus:ring-2 focus:ring-[var(--cloud-accent,#B91C1C)]/20';

export const sectionClass = 'overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm';

export const optionCardClass = (active) =>
  `rounded-xl border-2 p-4 text-left transition-all ${
    active
      ? 'border-[var(--cloud-accent,#B91C1C)] bg-[var(--cloud-accent-soft,#fef2f2)] shadow-sm ring-1 ring-[var(--cloud-accent,#B91C1C)]/10'
      : 'border-gray-200 bg-white hover:border-gray-300 hover:shadow-sm'
  }`;

export const checkboxClass =
  'h-4 w-4 rounded border-gray-300 text-[var(--cloud-accent,#B91C1C)] focus:ring-2 focus:ring-[var(--cloud-accent,#B91C1C)]/20';
