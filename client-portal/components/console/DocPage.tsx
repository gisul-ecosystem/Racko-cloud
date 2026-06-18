import type { ReactNode } from 'react';

interface DocPageProps {
  title: string;
  subtitle?: string;
  children: ReactNode;
}

export function DocPage({ title, subtitle, children }: DocPageProps) {
  return (
    <div className="max-w-3xl">
      <div className="mb-8 border-b border-gray-100 pb-6">
        <h1 className="text-2xl font-bold text-gray-900">{title}</h1>
        {subtitle && <p className="mt-1.5 text-sm text-gray-500">{subtitle}</p>}
      </div>
      <div className="space-y-8 text-sm leading-relaxed text-gray-700">{children}</div>
    </div>
  );
}

export function DocSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section>
      <h2 className="mb-3 text-base font-semibold text-gray-900">{title}</h2>
      <div className="space-y-3">{children}</div>
    </section>
  );
}

export function DocNote({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-lg border border-blue-100 bg-blue-50 px-4 py-3 text-sm text-blue-800">
      {children}
    </div>
  );
}

export function DocWarning({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-lg border border-amber-100 bg-amber-50 px-4 py-3 text-sm text-amber-800">
      {children}
    </div>
  );
}

export function DocSteps({ steps }: { steps: { title: string; description: string }[] }) {
  return (
    <ol className="space-y-4">
      {steps.map((step, i) => (
        <li key={i} className="flex gap-4">
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#B91C1C] text-xs font-bold text-white">
            {i + 1}
          </span>
          <div>
            <p className="font-medium text-gray-900">{step.title}</p>
            <p className="mt-0.5 text-gray-500">{step.description}</p>
          </div>
        </li>
      ))}
    </ol>
  );
}

export function DocFaq({ items }: { items: { q: string; a: string }[] }) {
  return (
    <div className="space-y-5">
      {items.map((item, i) => (
        <div key={i}>
          <p className="font-medium text-gray-900">{item.q}</p>
          <p className="mt-1 text-gray-500">{item.a}</p>
        </div>
      ))}
    </div>
  );
}
