'use client';

import { useCloudAccentColor } from '@/lib/cloudAccent';
import { hexToRgba } from '@/lib/tenantAccentStyles';

export default function GCPDashboard() {
  const accent = useCloudAccentColor();
  const soft = hexToRgba(accent, 0.1);

  return (
    <div style={{ padding: '32px 24px', maxWidth: 1200, margin: '0 auto' }}>
      {/* Header */}
      <div
        style={{
          background: '#fff',
          borderRadius: 12,
          padding: 24,
          border: '1px solid #e5e7eb',
          marginBottom: 24,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <div
            style={{
              width: 48,
              height: 48,
              background: soft,
              color: accent,
              borderRadius: 10,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 24,
            }}
          >
            🌐
          </div>
          <div>
            <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0 }}>GCP Services</h1>
            <p style={{ color: '#6b7280', margin: '4px 0 0', fontSize: 14 }}>
              Google Cloud access management, provisioning, and lab environments.
            </p>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 12 }}>
          <button
            style={{
              padding: '8px 16px',
              borderRadius: 6,
              border: '1px solid #e5e7eb',
              background: '#fff',
              cursor: 'pointer',
              fontSize: 13,
              display: 'flex',
              alignItems: 'center',
              gap: 6,
            }}
          >
            ↻ Refresh
          </button>
          <button
            style={{
              padding: '8px 20px',
              borderRadius: 6,
              background: accent,
              color: '#fff',
              border: 'none',
              cursor: 'pointer',
              fontSize: 13,
              fontWeight: 600,
            }}
          >
            + Create Request
          </button>
        </div>
      </div>

      {/* Stat cards — same as Azure/AWS */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(4, 1fr)',
          gap: 16,
          marginBottom: 24,
        }}
      >
        {[
          { label: 'Total Requests', value: 0, icon: '📋' },
          { label: 'Completed', value: 0, icon: '✅' },
          { label: 'Provisioning', value: 0, icon: '⚡' },
          { label: 'Expired', value: 0, icon: '⏰' },
        ].map((card) => (
          <div
            key={card.label}
            style={{
              background: '#fff',
              borderRadius: 10,
              padding: '20px 24px',
              border: '1px solid #e5e7eb',
            }}
          >
            <div style={{ fontSize: 28, fontWeight: 700 }}>{card.value}</div>
            <div style={{ fontSize: 13, color: '#6b7280', marginTop: 4 }}>
              {card.icon} {card.label}
            </div>
          </div>
        ))}
      </div>

      {/* Recent requests — empty state */}
      <div
        style={{
          background: '#fff',
          borderRadius: 12,
          border: '1px solid #e5e7eb',
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            padding: '20px 24px',
            borderBottom: '1px solid #e5e7eb',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <div>
            <div style={{ fontWeight: 600, fontSize: 15 }}>Recent requests</div>
            <div style={{ fontSize: 13, color: '#6b7280', marginTop: 2 }}>
              0 total provisioning requests
            </div>
          </div>
        </div>

        <div style={{ padding: 64, textAlign: 'center', color: '#6b7280' }}>
          <div style={{ fontSize: 40, marginBottom: 16 }}>🌐</div>
          <div style={{ fontWeight: 600, fontSize: 16, marginBottom: 8 }}>
            No GCP lab requests yet
          </div>
          <div style={{ fontSize: 13, marginBottom: 24 }}>
            Create your first GCP lab request to get started
          </div>
          <button
            style={{
              padding: '10px 24px',
              borderRadius: 6,
              background: accent,
              color: '#fff',
              border: 'none',
              cursor: 'pointer',
              fontSize: 13,
              fontWeight: 600,
            }}
          >
            + Create Request
          </button>
        </div>
      </div>

      <div
        style={{
          marginTop: 24,
          background: '#fff',
          borderRadius: 12,
          border: '1px solid #e5e7eb',
          padding: 20,
        }}
      >
        <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 12, color: accent }}>
          ⏰ Operational notes
        </div>
        <ul style={{ margin: 0, paddingLeft: 20, fontSize: 13, color: '#374151', lineHeight: 2 }}>
          <li>Requests flow through the GCP automation API and are provisioned into GCP Projects.</li>
          <li>Each lab gets its own GCP Project linked to your billing account.</li>
          <li>Pending requests are actively provisioning; completed requests have credentials ready.</li>
          <li>Expired requests are cleaned up automatically by the expiry scheduler.</li>
          <li>Use Org Admin for project management and elevated access workflows.</li>
        </ul>
      </div>
    </div>
  );
}
