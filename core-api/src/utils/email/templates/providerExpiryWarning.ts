import { buildBrandedEmail, type EmailBrand } from './brandedLayout';
import { resolvePlatformEmailBrand } from './emailBrand';

export interface ProviderExpiryResourceRow {
  ipAddress: string;
  username: string;
  vmSpec: string;
  planDuration: string;
  expiryDate: string;
}

export interface ProviderExpiryWarningTemplateData {
  projectName: string;
  clientName: string | null;
  resources: ProviderExpiryResourceRow[];
  soonestDays: number;
  soonestDateLabel: string;
  inventoryUrl: string;
  brand?: EmailBrand;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function dayLabel(days: number): string {
  if (days <= 0) return 'today';
  if (days === 1) return 'tomorrow';
  return `in ${days} days`;
}

function resourcesTable(resources: ProviderExpiryResourceRow[]): string {
  const th =
    'padding:10px 12px;font-size:12px;color:#6b7280;text-align:left;border-bottom:1px solid #e5e7eb;';
  const td =
    'padding:10px 12px;font-size:13px;color:#111827;border-bottom:1px solid #e5e7eb;';
  const rows = resources
    .map(
      (row, index) => `
      <tr style="background:${index % 2 === 0 ? '#ffffff' : '#f9fafb'};">
        <td style="${td};font-family:ui-monospace,monospace;">${escapeHtml(row.ipAddress)}</td>
        <td style="${td}">${escapeHtml(row.username || '—')}</td>
        <td style="${td}">${escapeHtml(row.vmSpec || '—')}</td>
        <td style="${td}">${escapeHtml(row.expiryDate)}</td>
      </tr>`
    )
    .join('');

  return `
    <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e5e7eb;border-radius:10px;overflow:hidden;text-align:left;">
      <tr style="background:#f9fafb;">
        <th style="${th}">IP</th>
        <th style="${th}">Username</th>
        <th style="${th}">VM spec</th>
        <th style="${th}">Expiry</th>
      </tr>
      ${rows}
    </table>`;
}

export function buildProviderExpiryWarningTemplate(data: ProviderExpiryWarningTemplateData) {
  const brand = data.brand ?? resolvePlatformEmailBrand();
  const timeLabel = dayLabel(data.soonestDays);
  const resourceCount = data.resources.length;
  const resourceLabel = `${resourceCount} ${resourceCount === 1 ? 'resource' : 'resources'}`;

  const detailsHtml = `
    <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e5e7eb;border-radius:10px;overflow:hidden;text-align:left;margin-bottom:16px;">
      <tr style="background:#f9fafb;">
        <td style="padding:12px 16px;font-size:13px;color:#6b7280;width:38%;border-bottom:1px solid #e5e7eb;">Project</td>
        <td style="padding:12px 16px;font-size:13px;color:#111827;border-bottom:1px solid #e5e7eb;">${escapeHtml(data.projectName)}</td>
      </tr>
      ${
        data.clientName
          ? `<tr>
        <td style="padding:12px 16px;font-size:13px;color:#6b7280;border-bottom:1px solid #e5e7eb;">Client</td>
        <td style="padding:12px 16px;font-size:13px;color:#111827;border-bottom:1px solid #e5e7eb;">${escapeHtml(data.clientName)}</td>
      </tr>`
          : ''
      }
      <tr style="background:#f9fafb;">
        <td style="padding:12px 16px;font-size:13px;color:#6b7280;border-bottom:1px solid #e5e7eb;">First contract ends</td>
        <td style="padding:12px 16px;font-size:13px;color:#111827;border-bottom:1px solid #e5e7eb;">${escapeHtml(data.soonestDateLabel)} (${escapeHtml(timeLabel)})</td>
      </tr>
      <tr>
        <td style="padding:12px 16px;font-size:13px;color:#6b7280;">Resources</td>
        <td style="padding:12px 16px;font-size:13px;color:#111827;">${resourceLabel}</td>
      </tr>
    </table>
    <p style="margin:0 0 8px;font-size:13px;font-weight:600;color:#374151;">Resources on this project</p>
    ${resourcesTable(data.resources)}`;

  const bodyHtml = `
    <p style="margin:0;font-size:15px;line-height:1.6;color:#374151;">
      Provider contracts for this project are ending ${escapeHtml(timeLabel)}.
      The resources below are the machines on
      <strong>${escapeHtml(data.projectName)}</strong> that need renewal.
    </p>`;

  return buildBrandedEmail(brand, {
    subject: `${data.projectName} — ${resourceLabel} ending ${timeLabel}`,
    headline: 'Project resources ending',
    bodyHtml,
    detailsHtml,
    ctaLabel: 'Open VM inventory',
    ctaUrl: data.inventoryUrl,
    noticeTitle: 'Renewed already?',
    noticeBody:
      'Update the provider end date on these VMs in the inventory. This alert is sent once per contract end date.',
    hero: 'alert',
  });
}
