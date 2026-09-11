import { buildBrandedEmail, type EmailBrand } from './brandedLayout';
import { resolvePlatformEmailBrand } from './emailBrand';
import type { ProjectExpiryAgentSummary } from '../../../modules/projects/projectExpiryResources';

export interface ProjectExpiryWarningTemplateData {
  projectName: string;
  clientName: string;
  endDateLabel: string;
  daysRemaining: number;
  graceHours: number;
  manageUrl: string;
  archiveUrl?: string;
  agentSummary?: ProjectExpiryAgentSummary;
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

function expiryHeadline(daysRemaining: number): string {
  if (daysRemaining === 1) return 'Project ending in 24 hours';
  return 'Project ending soon';
}

function buildServicesCountHtml(summary: ProjectExpiryAgentSummary): string {
  if (summary.services.length === 0) {
    return '<p style="margin:0;font-size:13px;color:#6b7280;">No services enabled.</p>';
  }

  const rows = summary.services
    .map(
      (service, index) => `
      <tr style="background:${index % 2 === 0 ? '#ffffff' : '#f9fafb'};">
        <td style="padding:10px 14px;font-size:13px;color:#111827;border-bottom:1px solid #e5e7eb;">${escapeHtml(service.label)}</td>
        <td style="padding:10px 14px;font-size:13px;color:#111827;border-bottom:1px solid #e5e7eb;text-align:right;">${service.count}</td>
      </tr>`
    )
    .join('');

  return `
    <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e5e7eb;border-radius:10px;overflow:hidden;text-align:left;">
      <tr style="background:#f9fafb;">
        <th style="padding:10px 14px;font-size:12px;color:#6b7280;text-align:left;border-bottom:1px solid #e5e7eb;">Service</th>
        <th style="padding:10px 14px;font-size:12px;color:#6b7280;text-align:right;border-bottom:1px solid #e5e7eb;">Resources</th>
      </tr>
      ${rows}
    </table>`;
}

export function buildProjectExpiryWarningTemplate(data: ProjectExpiryWarningTemplateData) {
  const brand = data.brand ?? resolvePlatformEmailBrand();
  const timeLabel = expiryTimeLabel(data.daysRemaining);
  const primary = brand.primaryColor;
  const agentSummary = data.agentSummary;
  const attachmentName = data.attachmentFilename?.trim();
  const resourceCount = agentSummary?.resources.length ?? 0;

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
        <td style="padding:12px 16px;font-size:13px;color:#111827;">After the end date, the project enters a ${data.graceHours}-hour grace period. Assigned VMs and servers are then unassigned automatically and the project is archived. VMs are not deleted.</td>
      </tr>
    </table>
    ${
      agentSummary
        ? `<p style="margin:16px 0 8px;font-size:13px;font-weight:600;color:#374151;">Resources by service</p>${buildServicesCountHtml(agentSummary)}`
        : ''
    }`;

  const attachmentNote = attachmentName
    ? `<p style="margin:16px 0 0;font-size:14px;color:#374151;line-height:1.6;">
        Please see the attached file
        <strong style="color:#111827;">${escapeHtml(attachmentName)}</strong>.
        It contains the full internal resource inventory (${resourceCount}
        ${resourceCount === 1 ? 'resource' : 'resources'}), including IPs and credentials.
      </p>`
    : resourceCount === 0
      ? `<p style="margin:16px 0 0;font-size:14px;color:#6b7280;line-height:1.6;">
          No resources were found on this project.
        </p>`
      : '';

  const bodyHtml = `
    <p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:#374151;">
      A Racko project you support is approaching its end date. Review the attached inventory,
      extend the end date if the client needs more time, or archive the project if the
      engagement is complete.
    </p>
    ${attachmentNote}
    <p style="margin:16px 0 0;font-size:14px;color:#6b7280;line-height:1.6;">
      Sign in with org admin or super admin credentials to extend the end date.
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
    noticeTitle: 'Internal use',
    noticeBody: attachmentName
      ? 'The attached spreadsheet contains server IPs and credentials. Do not forward to the client — the client receives a separate notice with login details only.'
      : 'Do not forward internal project details to the client.',
    hero: 'alert',
  });
}
