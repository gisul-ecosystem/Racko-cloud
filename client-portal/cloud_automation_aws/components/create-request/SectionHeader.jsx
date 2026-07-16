'use client';

function SectionHeader({ step, title, description }) {
  return (
    <div className="flex items-start gap-4 border-b border-gray-100 pb-5">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[var(--cloud-accent-soft,#fef2f2)] text-sm font-bold text-[var(--cloud-accent,#B91C1C)] ring-1 ring-[var(--cloud-accent,#B91C1C)]/10">
        {step}
      </span>
      <div className="min-w-0">
        <h2 className="text-base font-semibold text-gray-900">{title}</h2>
        {description ? (
          <p className="mt-0.5 text-sm leading-relaxed text-gray-500">{description}</p>
        ) : null}
      </div>
    </div>
  );
}

export { SectionHeader };
