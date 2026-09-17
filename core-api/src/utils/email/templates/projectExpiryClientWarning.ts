import { buildBrandedEmail, type EmailBrand } from './brandedLayout';
import { resolvePlatformEmailBrand } from './emailBrand';
import type { ProjectExpiryClientSummary } from '../../../modules/projects/projectExpiryResources';

export interface ProjectExpiryClientWarningTemplateData {
  projectName: string;
  clientName: string;
  endDateLabel: string;
  daysRemaining: number;
  graceHours: number;
  clientSummary: ProjectExpiryClientSummary;
  attachmentFilename?: string;
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

function vmCountLabel(count: number): string {
  if (count === 1) return '1 VM / login';
  return `${count} VMs / logins`;
}

function buildServiceGroupsHtml(summary: ProjectExpiryClientSummary): string {
  if (summary.serviceGroups.length === 0) {
    return '<p style="margin:0;font-size:13px;color:#6b7280;">No services are enabled on this project.</p>';
  }

  const rows = summary.serviceGroups
    .map(
      (group, index) => `
      <tr style="background:${index % 2 === 0 ? '#ffffff' : '#f9fafb'};">
        <td style="padding:10px 14px;font-size:13px;color:#111827;border-bottom:1px solid #e5e7eb;">${escapeHtml(group.serviceLabel)}</td>
        <td style="padding:10px 14px;font-size:13px;color:#111827;border-bottom:1px solid #e5e7eb;text-align:right;">${escapeHtml(vmCountLabel(group.loginCount))}</td>
      </tr>`
    )
    .join('');

  return `
    <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e5e7eb;border-radius:10px;overflow:hidden;text-align:left;">
      <tr style="background:#f9fafb;">
        <th style="padding:10px 14px;font-size:12px;color:#6b7280;text-align:left;border-bottom:1px solid #e5e7eb;">Service</th>
        <th style="padding:10px 14px;font-size:12px;color:#6b7280;text-align:right;border-bottom:1px solid #e5e7eb;">Assigned</th>
      </tr>
      ${rows}
    </table>`;
}

export function buildProjectExpiryClientWarningTemplate(
  data: ProjectExpiryClientWarningTemplateData
) {
  const brand = data.brand ?? resolvePlatformEmailBrand();
  const timeLabel = expiryTimeLabel(data.daysRemaining);
  const loginCount = data.clientSummary.accessRows.length;
  const attachmentName = data.attachmentFilename?.trim();

  const detailsHtml = `
    <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e5e7eb;border-radius:10px;overflow:hidden;text-align:left;margin-bottom:16px;">
      <tr style="background:#f9fafb;">
        <td style="padding:12px 16px;font-size:13px;color:#6b7280;width:38%;border-bottom:1px solid #e5e7eb;">Project</td>
        <td style="padding:12px 16px;font-size:13px;color:#111827;border-bottom:1px solid #e5e7eb;">${escapeHtml(data.projectName)}</td>
      </tr>
      <tr>
        <td style="padding:12px 16px;font-size:13px;color:#6b7280;border-bottom:1px solid #e5e7eb;">Client</td>
        <td style="padding:12px 16px;font-size:13px;color:#111827;border-bottom:1px solid #e5e7eb;">${escapeHtml(data.clientName)}</td>
      </tr>
      <tr style="background:#f9fafb;">
        <td style="padding:12px 16px;font-size:13px;color:#6b7280;">End date</td>
        <td style="padding:12px 16px;font-size:13px;color:#111827;">${escapeHtml(data.endDateLabel)} (${timeLabel})</td>
      </tr>
    </table>
    <p style="margin:0 0 8px;font-size:13px;font-weight:600;color:#374151;">Services on this project</p>
    ${buildServiceGroupsHtml(data.clientSummary)}`;

  const attachmentNote = attachmentName
    ? `<p style="margin:16px 0 0;font-size:14px;color:#374151;line-height:1.6;">
        Please see the attached file
        <strong style="color:#111827;">${escapeHtml(attachmentName)}</strong>.
        It contains your login details (${loginCount}
        ${loginCount === 1 ? 'account' : 'accounts'}), grouped by service.
      </p>`
    : loginCount === 0
      ? `<p style="margin:16px 0 0;font-size:14px;color:#6b7280;line-height:1.6;">
          No login details were found for this project. Contact your account team if you need help.
        </p>`
      : '';

  const bodyHtml = `
    <p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:#374151;">
      Your Racko project is scheduled to end ${timeLabel}.
    </p>
    ${attachmentNote}
    <p style="margin:16px 0 0;font-size:14px;color:#6b7280;line-height:1.6;">
      Need more time? Contact your account team before the end date.
    </p>`;

  return buildBrandedEmail(brand, {
    subject: `Your project "${data.projectName}" ends ${timeLabel}`,
    headline: data.daysRemaining === 1 ? 'Project ending in 24 hours' : 'Project ending soon',
    bodyHtml,
    detailsHtml,
    noticeTitle: 'Keep your details safe',
    noticeBody: attachmentName
      ? 'The attached spreadsheet contains your login passwords. Store it securely and do not share it publicly.'
      : 'Contact your account team if you need to extend this project or recover access details.',
    hero: 'alert',
  });
}
