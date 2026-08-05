import { config } from '../../../config';

export interface EmailBrand {
  /** Display name in header / footer (tenant portal name or platform). */
  name: string;
  primaryColor: string;
  /** Optional soft tint; falls back to a translucent primary. */
  secondaryColor?: string;
  logoUrl?: string;
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
  hero: 'verify' | 'reset' | 'invite' | 'alert' | 'locked';
}

export function defaultPlatformBrand(): EmailBrand {
  const websiteUrl = config.FRONTEND_URL.replace(/\/$/, '');
  let websiteLabel = websiteUrl;
  try {
    websiteLabel = new URL(websiteUrl).host;
  } catch {
    // keep raw
  }
  return {
    name: config.EMAIL_FROM_NAME,
    primaryColor: '#B91C1C',
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

function heroIconHtml(hero: BrandedEmailContent['hero'], primary: string, soft: string): string {
  // Inline SVG keeps the envelope/lock look consistent across clients (closer to the design mock).
  const icons: Record<BrandedEmailContent['hero'], string> = {
    verify: `<svg width="36" height="36" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M4 6.5A1.5 1.5 0 0 1 5.5 5h13A1.5 1.5 0 0 1 20 6.5v11a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 17.5v-11Z" stroke="${primary}" stroke-width="1.8"/><path d="m5 7 7 5 7-5" stroke="${primary}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
    reset: `<svg width="36" height="36" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M8 10V8a4 4 0 1 1 8 0v2" stroke="${primary}" stroke-width="1.8" stroke-linecap="round"/><rect x="5" y="10" width="14" height="10" rx="2" stroke="${primary}" stroke-width="1.8"/><circle cx="12" cy="15" r="1.5" fill="${primary}"/></svg>`,
    invite: `<svg width="36" height="36" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M4 6.5A1.5 1.5 0 0 1 5.5 5h13A1.5 1.5 0 0 1 20 6.5v11a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 17.5v-11Z" stroke="${primary}" stroke-width="1.8"/><path d="m5 7 7 5 7-5" stroke="${primary}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
    alert: `<svg width="36" height="36" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M12 3 21 20H3L12 3Z" stroke="${primary}" stroke-width="1.8" stroke-linejoin="round"/><path d="M12 10v4" stroke="${primary}" stroke-width="1.8" stroke-linecap="round"/><circle cx="12" cy="17" r="1" fill="${primary}"/></svg>`,
    locked: `<svg width="36" height="36" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M8 10V8a4 4 0 1 1 8 0v2" stroke="${primary}" stroke-width="1.8" stroke-linecap="round"/><rect x="5" y="10" width="14" height="10" rx="2" stroke="${primary}" stroke-width="1.8"/></svg>`,
  };
  const glyph = icons[hero] ?? icons.verify;
  return `
              <table cellpadding="0" cellspacing="0" role="presentation" style="margin:0 auto 8px;">
                <tr>
                  <td align="center" style="width:88px;height:88px;border-radius:999px;background:${soft};vertical-align:middle;">
                    <div style="line-height:0;">${glyph}</div>
                  </td>
                </tr>
                <tr>
                  <td align="right" style="padding-top:0;height:0;line-height:0;font-size:0;">
                    <div style="display:inline-block;margin-top:-22px;margin-right:2px;width:26px;height:26px;border-radius:999px;background:${primary};color:#ffffff;font-size:14px;line-height:26px;text-align:center;font-weight:700;">✓</div>
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
  const soft = brand.secondaryColor?.trim() || softPrimary(primary, 0.12);
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
    ? `<img src="${escapeHtml(brand.logoUrl)}" alt="${name}" width="160" style="display:block;margin:0 auto;max-width:160px;height:auto;border:0;" />`
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
</head>
<body style="margin:0;padding:0;background-color:#f3f4f6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="background-color:#f3f4f6;padding:40px 16px;">
    <tr>
      <td align="center">
        <table width="560" cellpadding="0" cellspacing="0" role="presentation" style="max-width:560px;width:100%;background:#ffffff;border-radius:16px;overflow:hidden;border:1px solid #e5e7eb;">
          <tr>
            <td style="padding:28px 36px 20px;text-align:center;">
              ${logoBlock}
            </td>
          </tr>
          <tr>
            <td style="padding:0 36px;">
              <div style="height:1px;background:#e5e7eb;line-height:1px;font-size:1px;">&nbsp;</div>
            </td>
          </tr>
          <tr>
            <td style="padding:32px 36px 8px;text-align:center;">
              ${heroIconHtml(content.hero, primary, soft)}
              <p style="margin:8px 0 12px;font-size:26px;font-weight:700;color:#111827;letter-spacing:-0.4px;">${headline}</p>
              <div style="margin:0 0 24px;font-size:15px;color:#6b7280;line-height:1.65;text-align:center;">${content.bodyHtml}</div>
              ${content.detailsHtml ? `<div style="margin:0 0 24px;text-align:left;">${content.detailsHtml}</div>` : ''}
              <table cellpadding="0" cellspacing="0" role="presentation" style="margin:0 auto 28px;">
                <tr>
                  <td style="background:${primary};border-radius:10px;">
                    <a href="${ctaUrl}" style="display:inline-block;padding:14px 28px;font-size:15px;font-weight:600;color:#ffffff;text-decoration:none;">${ctaLabel} →</a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="padding:0 36px 8px;">
              <div style="height:1px;background:#e5e7eb;line-height:1px;font-size:1px;">&nbsp;</div>
            </td>
          </tr>
          <tr>
            <td style="padding:20px 36px 8px;">
              <p style="margin:0 0 10px;font-size:13px;color:#9ca3af;">🔗 ${fallbackHint}</p>
              <div style="padding:12px 14px;border-radius:10px;background:#f9fafb;border:1px solid ${primary};">
                <a href="${ctaUrl}" style="font-size:12px;color:${primary};word-break:break-all;text-decoration:none;line-height:1.5;">${ctaUrl}</a>
              </div>
              ${expiryBlock}
            </td>
          </tr>
          <tr>
            <td style="padding:24px 36px 32px;">
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
