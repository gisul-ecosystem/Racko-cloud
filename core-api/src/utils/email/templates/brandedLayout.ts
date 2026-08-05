import { config } from '../../../config';
import { getAppBaseUrl } from '../../requestContext';

export interface EmailBrand {
  /** Display name in header / footer (tenant portal name or platform). */
  name: string;
  primaryColor: string;
  /** Optional soft tint; falls back to a translucent primary. */
  secondaryColor?: string;
  logoUrl?: string;
  /** Show the brand name beside the logo (used for the Racko icon wordmark). */
  showNameWithLogo?: boolean;
  /** Absolute site URL used for footer + relative assets. */
  websiteUrl: string;
  /** Footer label, e.g. www.example.com */
  websiteLabel: string;
}

export interface BrandedEmailContent {
  subject: string;
  headline: string;
  bodyHtml: string;
  ctaLabel: string;
  ctaUrl: string;
  fallbackHint?: string;
  expiryText?: string;
  noticeTitle?: string;
  noticeBody?: string;
  /** Optional block under body (credentials table, login details, etc.). */
  detailsHtml?: string;
  /** Optional secondary action shown after the primary CTA. */
  afterCtaHtml?: string;
  hero: 'verify' | 'reset' | 'invite' | 'alert' | 'locked';
}

export function defaultPlatformBrand(): EmailBrand {
  const websiteUrl = getAppBaseUrl();
  let websiteLabel = websiteUrl;
  try {
    websiteLabel = new URL(websiteUrl).host;
  } catch {
    // keep raw
  }
  return {
    name: config.EMAIL_FROM_NAME,
    primaryColor: '#B91C1C',
    logoUrl: 'cid:racko-logo',
    showNameWithLogo: true,
    websiteUrl,
    websiteLabel,
  };
}

/** Soft tint of primary for icon circle / footer panels. */
export function softPrimary(hex: string, alpha = 0.12): string {
  const cleaned = hex.replace('#', '');
  if (!/^[0-9a-fA-F]{6}$/.test(cleaned)) return `rgba(185, 28, 28, ${alpha})`;
  const r = parseInt(cleaned.slice(0, 2), 16);
  const g = parseInt(cleaned.slice(2, 4), 16);
  const b = parseInt(cleaned.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function heroIconHtml(hero: BrandedEmailContent['hero']): string {
  // CID-embedded PNGs use Lucide geometry and work in clients that strip SVG.
  const icons: Record<BrandedEmailContent['hero'], string> = {
    verify: 'cid:email-mail-check',
    reset: 'cid:email-key-check',
    invite: 'cid:email-mail-check',
    alert: 'cid:email-alert-check',
    locked: 'cid:email-lock-check',
  };
  const iconSrc = icons[hero] ?? icons.verify;
  return `
              <table cellpadding="0" cellspacing="0" role="presentation" style="margin:0 auto 12px;">
                <tr>
                  <td align="center">
                    <img src="${iconSrc}" alt="" width="104" height="112" style="display:block;width:104px;height:112px;border:0;" />
                  </td>
                </tr>
              </table>`;
}

/**
 * Shared transactional email shell matching the branded verify-email design.
 * Brand (logo / colors / name / domain) comes from platform or tenant context.
 */
export function buildBrandedEmail(
  brand: EmailBrand,
  content: BrandedEmailContent
): { subject: string; html: string; text: string } {
  const primary = brand.primaryColor || '#B91C1C';
  const softStrong = softPrimary(primary, 0.18);
  const name = escapeHtml(brand.name);
  const websiteLabel = escapeHtml(brand.websiteLabel);
  const websiteUrl = escapeHtml(brand.websiteUrl);
  const ctaUrl = escapeHtml(content.ctaUrl);
  const headline = escapeHtml(content.headline);
  const ctaLabel = escapeHtml(content.ctaLabel);
  const fallbackHint = escapeHtml(
    content.fallbackHint ??
      "If the button doesn't work, copy and paste this link into your browser:"
  );

  const logoBlock = brand.logoUrl
    ? brand.showNameWithLogo
      ? `<table cellpadding="0" cellspacing="0" role="presentation" style="margin:0 auto;"><tr><td style="vertical-align:middle;padding-right:12px;"><img src="${escapeHtml(brand.logoUrl)}" alt="" width="58" height="58" style="display:block;width:58px;height:58px;border:0;" /></td><td style="vertical-align:middle;font-size:34px;font-weight:800;color:#111111;letter-spacing:-1px;">${name}</td></tr></table>`
      : `<img src="${escapeHtml(brand.logoUrl)}" alt="${name}" width="160" style="display:block;margin:0 auto;max-width:160px;max-height:64px;height:auto;border:0;" />`
    : `<p style="margin:0;font-size:22px;font-weight:700;color:#111827;letter-spacing:-0.3px;">${name}</p>`;

  const expiryBlock = content.expiryText
    ? `<p style="margin:12px 0 0;font-size:12px;color:#9ca3af;text-align:right;">⏱ ${escapeHtml(content.expiryText)}</p>`
    : '';

  const noticeTitle = content.noticeTitle ?? "Didn't mean to get this?";
  const noticeBody = content.noticeBody ?? 'You can safely ignore this email.';

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${headline}</title>
  <style>
    @media only screen and (max-width: 600px) {
      .email-outer { padding: 16px 8px !important; }
      .email-pad { padding-left: 22px !important; padding-right: 22px !important; }
      .email-title { font-size: 23px !important; }
    }
  </style>
</head>
<body style="margin:0;padding:0;background-color:#f3f4f6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <table class="email-outer" width="100%" cellpadding="0" cellspacing="0" role="presentation" style="background-color:#f3f4f6;padding:40px 16px;">
    <tr>
      <td align="center">
        <table width="560" cellpadding="0" cellspacing="0" role="presentation" style="max-width:560px;width:100%;background:#ffffff;border-radius:16px;overflow:hidden;border:1px solid #e5e7eb;">
          <tr>
            <td class="email-pad" style="padding:28px 36px 20px;text-align:center;">
              ${logoBlock}
            </td>
          </tr>
          <tr>
            <td class="email-pad" style="padding:0 36px;">
              <div style="height:1px;background:#e5e7eb;line-height:1px;font-size:1px;">&nbsp;</div>
            </td>
          </tr>
          <tr>
            <td class="email-pad" style="padding:32px 36px 8px;text-align:center;">
              ${heroIconHtml(content.hero)}
              <p class="email-title" style="margin:8px 0 12px;font-size:26px;font-weight:700;color:#111827;letter-spacing:-0.4px;">${headline}</p>
              <div style="margin:0 0 24px;font-size:15px;color:#6b7280;line-height:1.65;text-align:center;">${content.bodyHtml}</div>
              ${content.detailsHtml ? `<div style="margin:0 0 24px;text-align:left;">${content.detailsHtml}</div>` : ''}
              <table cellpadding="0" cellspacing="0" role="presentation" style="margin:0 auto 28px;">
                <tr>
                  <td style="background:${primary};border-radius:10px;">
                    <a href="${ctaUrl}" style="display:inline-block;padding:14px 28px;font-size:15px;font-weight:600;color:#ffffff;text-decoration:none;">${ctaLabel} →</a>
                  </td>
                </tr>
              </table>
              ${content.afterCtaHtml ? `<div style="margin:-8px 0 28px;text-align:center;">${content.afterCtaHtml}</div>` : ''}
            </td>
          </tr>
          <tr>
            <td class="email-pad" style="padding:0 36px 8px;">
              <div style="height:1px;background:#e5e7eb;line-height:1px;font-size:1px;">&nbsp;</div>
            </td>
          </tr>
          <tr>
            <td class="email-pad" style="padding:20px 36px 8px;">
              <p style="margin:0 0 10px;font-size:13px;color:#9ca3af;">🔗 ${fallbackHint}</p>
              <div style="padding:12px 14px;border-radius:10px;background:#f9fafb;border:1px solid ${primary};">
                <a href="${ctaUrl}" style="font-size:12px;color:${primary};word-break:break-all;text-decoration:none;line-height:1.5;">${ctaUrl}</a>
              </div>
              ${expiryBlock}
            </td>
          </tr>
          <tr>
            <td class="email-pad" style="padding:24px 36px 32px;">
              <div style="padding:18px 16px;border-radius:12px;background:${softStrong};text-align:center;">
                <p style="margin:0 0 6px;font-size:14px;font-weight:700;color:#111827;">🛡 ${escapeHtml(noticeTitle)}</p>
                <p style="margin:0 0 14px;font-size:13px;color:#6b7280;">${escapeHtml(noticeBody)}</p>
                <p style="margin:0;font-size:12px;color:${primary};">
                  <a href="${websiteUrl}" style="color:${primary};text-decoration:none;">© ${websiteLabel}</a>
                </p>
              </div>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  const text = `${content.headline}

${content.bodyHtml.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()}

${content.ctaLabel}:
${content.ctaUrl}
${content.expiryText ? `\n${content.expiryText}` : ''}

${noticeTitle}
${noticeBody}

${brand.websiteLabel}`;

  return { subject: content.subject, html, text };
}
