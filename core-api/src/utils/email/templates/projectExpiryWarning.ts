import { buildBrandedEmail, type EmailBrand } from './brandedLayout';
import { resolvePlatformEmailBrand } from './emailBrand';

export interface ProjectExpiryWarningTemplateData {
  projectName: string;
  clientName: string;
  endDateLabel: string;
  daysRemaining: number;
  manageUrl: string;
  brand?: EmailBrand;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function buildProjectExpiryWarningTemplate(data: ProjectExpiryWarningTemplateData) {
  const brand = data.brand ?? resolvePlatformEmailBrand();
  const dayLabel = data.daysRemaining === 1 ? 'tomorrow' : `in ${data.daysRemaining} days`;

  const bodyHtml = `
    <p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:#374151;">
      The project <strong>${escapeHtml(data.projectName)}</strong> (${escapeHtml(data.clientName)})
      is scheduled to end on <strong>${escapeHtml(data.endDateLabel)}</strong>.
    </p>
    <p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:#374151;">
      After the end date, the project will be archived automatically. Existing resources are not deleted,
      but new purchases under this project will be blocked unless you extend the end date.
    </p>
    <p style="margin:0 0 24px;font-size:15px;line-height:1.6;color:#374151;">
      Open the project in your console to extend the timeline or archive it manually.
    </p>
  `;

  return buildBrandedEmail(brand, {
    subject: `Project "${data.projectName}" ends ${dayLabel}`,
    headline: 'Project ending soon',
    bodyHtml,
    ctaLabel: 'Manage project',
    ctaUrl: data.manageUrl,
    hero: 'alert',
  });
}
