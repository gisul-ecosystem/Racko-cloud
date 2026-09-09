import { buildBrandedEmail, type EmailBrand } from './brandedLayout';
import { resolvePlatformEmailBrand } from './emailBrand';

export interface ProviderExpiryWarningTemplateData {
  /** Machines in the alert. The per-VM detail travels in the attached sheet. */
  vmCount: number;
  /** Rows in the attachment — higher than vmCount when a VM has several logins. */
  loginCount: number;
  /** Days until the nearest contract ends. */
  soonestDays: number;
  soonestDateLabel: string;
  /** The sheet's filename, so the body can name what to open. */
  attachmentName: string;
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

export function buildProviderExpiryWarningTemplate(data: ProviderExpiryWarningTemplateData) {
  const brand = data.brand ?? resolvePlatformEmailBrand();
  const { vmCount, loginCount, soonestDays } = data;
  const timeLabel = dayLabel(soonestDays);
  const vmLabel = `${vmCount} ${vmCount === 1 ? 'VM' : 'VMs'}`;

  const cell = 'padding:12px 16px;font-size:13px;color:#111827;border-bottom:1px solid #e5e7eb;';
  const label =
    'padding:12px 16px;font-size:13px;color:#6b7280;width:38%;border-bottom:1px solid #e5e7eb;';

  const detailsHtml = `
    <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e5e7eb;border-radius:10px;overflow:hidden;text-align:left;">
      <tr style="background:#f9fafb;">
        <td style="${label}">Machines</td>
        <td style="${cell}">${vmCount}</td>
      </tr>
      <tr>
        <td style="${label}">First contract ends</td>
        <td style="${cell}">${escapeHtml(data.soonestDateLabel)} (${escapeHtml(timeLabel)})</td>
      </tr>
      <tr style="background:#f9fafb;">
        <td style="${label}">Attached</td>
        <td style="${cell}">${escapeHtml(data.attachmentName)} — ${loginCount} row${loginCount === 1 ? '' : 's'} with IP, username, VM spec, plan duration and expiry date</td>
      </tr>
    </table>`;

  const bodyHtml = `
    <p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:#374151;">
      The provider contract for ${vmLabel} in the Racko VM inventory ends ${escapeHtml(timeLabel)}.
      The attached sheet lists every affected machine.
    </p>
    <p style="margin:0;font-size:15px;line-height:1.6;color:#374151;">
      Renew with the provider to keep ${vmCount === 1 ? 'it' : 'them'} running. When a contract
      lapses the provider reclaims the machine — Racko does not renew automatically and cannot
      recover the box afterwards.
    </p>`;

  return buildBrandedEmail(brand, {
    subject: `${vmCount} VM${vmCount === 1 ? '' : 's'} — provider contract ends ${timeLabel}`,
    headline: vmCount === 1 ? 'VM contract ending' : 'VM contracts ending',
    bodyHtml,
    detailsHtml,
    ctaLabel: 'Open VM inventory',
    ctaUrl: data.inventoryUrl,
    noticeTitle: 'Renewed already?',
    noticeBody:
      'Import the provider sheet again with the new end dates, or edit the dates on each VM in the inventory. This alert is sent once per contract end date.',
    hero: 'alert',
  });
}
