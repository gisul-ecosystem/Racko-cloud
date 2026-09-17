import { buildBrandedEmail, type EmailBrand } from './brandedLayout';
import { resolvePlatformEmailBrand } from './emailBrand';

/**
 * Who the alert is going to. Only a super admin can act on it — the owner is
 * told so they can plan, and told who to ask for an extension.
 */
export type CatalogVmExpiryAudience = 'owner' | 'super_admin';

export interface CatalogVmExpiryWarningTemplateData {
  audience: CatalogVmExpiryAudience;
  planName: string;
  /** Provider label as shown in the console, e.g. Webyne or Azure. */
  providerLabel: string;
  /** Billing period the term was bought on, e.g. monthly. */
  billingLabel: string;
  ipAddress: string | null;
  hostname: string | null;
  /** Owner shown to super admins so they know who is affected. */
  ownerLabel: string | null;
  expiresAtLabel: string;
  daysRemaining: number;
  /** Whether the provider can be torn down through Racko at all. */
  canTerminateInRacko: boolean;
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

function dayLabel(days: number): string {
  if (days < 0) return 'has ended';
  if (days === 0) return 'ends today';
  if (days === 1) return 'ends tomorrow';
  return `ends in ${days} days`;
}

export function buildCatalogVmExpiryWarningTemplate(
  data: CatalogVmExpiryWarningTemplateData
) {
  const brand = data.brand ?? resolvePlatformEmailBrand();
  const forSuperAdmin = data.audience === 'super_admin';
  const timeLabel = dayLabel(data.daysRemaining);
  const machineLabel = data.ipAddress || data.hostname || 'Not yet assigned';

  const cell = 'padding:12px 16px;font-size:13px;color:#111827;border-bottom:1px solid #e5e7eb;';
  const label =
    'padding:12px 16px;font-size:13px;color:#6b7280;width:38%;border-bottom:1px solid #e5e7eb;';

  const ownerRow =
    forSuperAdmin && data.ownerLabel
      ? `<tr>
        <td style="${label}">In use by</td>
        <td style="${cell}">${escapeHtml(data.ownerLabel)}</td>
      </tr>`
      : '';

  const detailsHtml = `
    <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e5e7eb;border-radius:10px;overflow:hidden;text-align:left;">
      <tr style="background:#f9fafb;">
        <td style="${label}">Plan</td>
        <td style="${cell}">${escapeHtml(data.planName)}</td>
      </tr>
      <tr>
        <td style="${label}">Machine</td>
        <td style="${cell}"><span style="font-family:ui-monospace,SFMono-Regular,Menlo,monospace;">${escapeHtml(machineLabel)}</span></td>
      </tr>
      <tr style="background:#f9fafb;">
        <td style="${label}">Provider &amp; term</td>
        <td style="${cell}">${escapeHtml(data.providerLabel)} · ${escapeHtml(data.billingLabel)}</td>
      </tr>
      ${ownerRow}
      <tr${ownerRow ? ' style="background:#f9fafb;"' : ''}>
        <td style="${label}">Term ends</td>
        <td style="${cell}">${escapeHtml(data.expiresAtLabel)} (${escapeHtml(timeLabel)})</td>
      </tr>
    </table>`;

  const bodyHtml = forSuperAdmin
    ? `<p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:#374151;">
      The paid term for this ${escapeHtml(data.providerLabel)} VM ${escapeHtml(timeLabel)}.
      Racko does not renew it and ${
        data.canTerminateInRacko
          ? 'will not tear it down for you'
          : 'cannot terminate it for you'
      }, so it needs a decision.
    </p>
    <p style="margin:0;font-size:15px;line-height:1.6;color:#374151;">
      To keep it, renew with ${escapeHtml(data.providerLabel)} and then extend the end date in
      My VM so this alert re-arms for the new date. To drop it, terminate it on
      ${escapeHtml(data.providerLabel)} first, then delete it in My VM to clear the record and
      free the machine from its tenant.
    </p>`
    : `<p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:#374151;">
      The paid term for one of your VMs ${escapeHtml(timeLabel)}. After that date the provider
      reclaims the machine and anything left on it is lost.
    </p>
    <p style="margin:0;font-size:15px;line-height:1.6;color:#374151;">
      Back up any work you need to keep. If you want to carry on using this VM, ask your Racko
      administrator to extend the term before the end date.
    </p>`;

  // Subject is rendered as a header value, not HTML, so it stays unescaped.
  const subject = forSuperAdmin
    ? `${data.planName} — ${data.providerLabel} term ${timeLabel}`
    : `Your ${data.planName} VM ${timeLabel}`;

  return buildBrandedEmail(brand, {
    subject,
    headline: forSuperAdmin ? 'VM term ending' : 'Your VM term is ending',
    bodyHtml,
    detailsHtml,
    ctaLabel: forSuperAdmin ? 'Open My VM' : 'View my VMs',
    ctaUrl: data.manageUrl,
    ...(forSuperAdmin
      ? {
          noticeTitle: 'Renewed already?',
          noticeBody:
            'Use Extend on the VM row to push the end date out. This alert is sent once per end date, so extending it arms a fresh warning.',
        }
      : {}),
    hero: 'alert',
  });
}
