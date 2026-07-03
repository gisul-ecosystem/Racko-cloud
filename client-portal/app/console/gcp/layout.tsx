'use client';

import Link from 'next/link';

export default function GCPConsoleLayout({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', minHeight: '100vh' }}>
      {/* Sidebar */}
      <div style={{
        width: 240, background: '#fff',
        borderRight: '1px solid #e5e7eb',
        padding: '24px 0', flexShrink: 0,
        display: 'flex', flexDirection: 'column',
      }}>
        {/* Service header */}
        <div style={{ padding: '0 20px 20px', borderBottom: '1px solid #f3f4f6' }}>
          <div style={{ fontWeight: 700, fontSize: 14 }}>GCP Services</div>
          <div style={{ fontSize: 12, color: '#6b7280', marginTop: 2 }}>Cloud automation</div>
        </div>

        {/* Nav items */}
        <nav style={{ padding: '12px 12px 0' }}>
          {[
            { label: 'Overview', href: '/console/gcp', icon: '▦' },
          ].map(item => (
            <Link
              key={item.href}
              href={item.href}
              style={{
                display: 'flex', alignItems: 'center', gap: 10,
                padding: '10px 12px', borderRadius: 6,
                textDecoration: 'none', fontSize: 14,
                fontWeight: 500,
                background: '#fef2f2', color: '#B91C1C',
              }}
            >
              <span>{item.icon}</span>
              <span>{item.label}</span>
            </Link>
          ))}
        </nav>

        {/* Back link */}
        <div style={{ padding: '20px 20px 0', marginTop: 'auto' }}>
          <Link
            href="/console"
            style={{
              fontSize: 13, color: '#6b7280',
              textDecoration: 'none',
              display: 'flex', alignItems: 'center', gap: 6,
            }}
          >
            ‹ All services
          </Link>
        </div>
      </div>

      {/* Main content */}
      <div style={{ flex: 1, background: '#f9fafb', overflowY: 'auto' }}>
        {children}
      </div>
    </div>
  );
}
