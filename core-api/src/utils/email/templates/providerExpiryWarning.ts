import { buildBrandedEmail, type EmailBrand } from './brandedLayout';
import { resolvePlatformEmailBrand } from './emailBrand';

export interface ProviderExpiryResourceRow {
  ipAddress: string;
  expiryDate: string;
}

export interface ProviderExpiryWarningTemplateData {
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
        <td style="${td}">${escapeHtml(row.expiryDate)}</td>
      </tr>`
    )
    .join('');

  return `
    <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e5e7eb;border-radius:10px;overflow:hidden;text-align:left;">
      <tr style="background:#f9fafb;">
        <th style="${th}">IP</th>
        <th style="${th}">Provider end date</th>
      </tr>
      ${rows}
    </table>`;
}

export function buildProviderExpiryWarningTemplate(data: ProviderExpiryWarningTemplateData) {
  const brand = data.brand ?? resolvePlatformEmailBrand();
  const timeLabel = dayLabel(data.soonestDays);
  const vmCount = data.resources.length;
  const vmLabel = `${vmCount} ${vmCount === 1 ? 'VM' : 'VMs'}`;

  const detailsHtml = `
    <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e5e7eb;border-radius:10px;overflow:hidden;text-align:left;margin-bottom:16px;">
      <tr style="background:#f9fafb;">
        <td style="padding:12px 16px;font-size:13px;color:#6b7280;width:38%;border-bottom:1px solid #e5e7eb;">Soonest end date</td>
        <td style="padding:12px 16px;font-size:13px;color:#111827;border-bottom:1px solid #e5e7eb;">${escapeHtml(data.soonestDateLabel)} (${escapeHtml(timeLabel)})</td>
      </tr>
      <tr>
        <td style="padding:12px 16px;font-size:13px;color:#6b7280;">VMs</td>
        <td style="padding:12px 16px;font-size:13px;color:#111827;">${vmLabel}</td>
      </tr>
    </table>
    ${resourcesTable(data.resources)}`;

  const bodyHtml = `
    <p style="margin:0;font-size:15px;line-height:1.6;color:#374151;">
      Provider contracts for the inventory VMs below are ending ${escapeHtml(timeLabel)}.
      This is the provider end date, not a project end date.
    </p>`;

  return buildBrandedEmail(brand, {
    subject: `${vmLabel} — provider contracts ending ${timeLabel}`,
    headline: 'Provider contract ending',
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
