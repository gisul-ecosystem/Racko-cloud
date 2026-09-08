import { buildBrandedEmail, type EmailBrand } from './brandedLayout';
import { resolvePlatformEmailBrand } from './emailBrand';

export interface ProjectExpiryWarningTemplateData {
  projectName: string;
  clientName: string;
  endDateLabel: string;
  daysRemaining: number;
  manageUrl: string;
  archiveUrl?: string;
  brand?: EmailBrand;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function expiryTimeLabel(daysRemaining: number): string {
  if (daysRemaining === 1) return 'in 24 hours';
  return `in ${daysRemaining} days`;
}

function expiryHeadline(daysRemaining: number): string {
  if (daysRemaining === 1) return 'Project ending in 24 hours';
  return 'Project ending soon';
}

export function buildProjectExpiryWarningTemplate(data: ProjectExpiryWarningTemplateData) {
  const brand = data.brand ?? resolvePlatformEmailBrand();
  const timeLabel = expiryTimeLabel(data.daysRemaining);
  const primary = brand.primaryColor;

  const detailsHtml = `
    <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e5e7eb;border-radius:10px;overflow:hidden;text-align:left;">
      <tr style="background:#f9fafb;">
        <td style="padding:12px 16px;font-size:13px;color:#6b7280;width:38%;border-bottom:1px solid #e5e7eb;">Project</td>
        <td style="padding:12px 16px;font-size:13px;color:#111827;border-bottom:1px solid #e5e7eb;">${escapeHtml(data.projectName)}</td>
      </tr>
      <tr>
        <td style="padding:12px 16px;font-size:13px;color:#6b7280;border-bottom:1px solid #e5e7eb;">Client</td>
        <td style="padding:12px 16px;font-size:13px;color:#111827;border-bottom:1px solid #e5e7eb;">${escapeHtml(data.clientName)}</td>
      </tr>
      <tr style="background:#f9fafb;">
        <td style="padding:12px 16px;font-size:13px;color:#6b7280;border-bottom:1px solid #e5e7eb;">End date</td>
        <td style="padding:12px 16px;font-size:13px;color:#111827;border-bottom:1px solid #e5e7eb;">${escapeHtml(data.endDateLabel)} (${timeLabel})</td>
      </tr>
      <tr>
        <td style="padding:12px 16px;font-size:13px;color:#6b7280;">If you take no action</td>
        <td style="padding:12px 16px;font-size:13px;color:#111827;">The project archives on the end date. Existing VMs and servers keep running until you stop or delete them. New purchases under this project will be blocked.</td>
      </tr>
    </table>`;

  const bodyHtml = `
    <p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:#374151;">
      Your Racko project is approaching its end date. Extend the end date to keep assigning
      new resources, or archive the project if the engagement is complete.
    </p>`;

  const afterCtaHtml = data.archiveUrl
    ? `<p style="margin:0;font-size:14px;color:#6b7280;line-height:1.6;">Project finished? <a href="${data.archiveUrl}" style="color:${primary};font-weight:600;text-decoration:none;">Archive project now</a></p>`
    : undefined;

  return buildBrandedEmail(brand, {
    subject: `Project "${data.projectName}" ends ${timeLabel}`,
    headline: expiryHeadline(data.daysRemaining),
    bodyHtml,
    detailsHtml,
    ctaLabel: 'Extend end date',
    ctaUrl: data.manageUrl,
    afterCtaHtml,
    noticeTitle: 'Need more time?',
    noticeBody:
      'Click Extend end date to update the timeline. If the project is finished, archive it now or let it auto-archive on the end date.',
    hero: 'alert',
  });
}
