import { config } from '../../../config';

export interface VmHostLeaseExpiryTemplateData {
  leases: Array<{
    ipAddress: string;
    provider: string;
    assignedTo: string;
    invoiceDate: string;
    dueDate: string;
    daysRemaining: number;
  }>;
  warningDays: number;
  platformName?: string;
}

export function buildVmHostLeaseExpiryTemplate(data: VmHostLeaseExpiryTemplateData): {
  subject: string;
  html: string;
  text: string;
} {
  const platformName = data.platformName ?? config.EMAIL_FROM_NAME;
  const count = data.leases.length;
  const subject =
    count === 1
      ? `[${platformName}] VM host lease due soon (${data.leases[0]!.ipAddress})`
      : `[${platformName}] ${count} VM host lease(s) due within ${data.warningDays} day(s)`;

  const rowsHtml = data.leases
    .map(
      (lease) => `
        <tr>
          <td style="padding:10px 12px;border-bottom:1px solid #e4e4e7;font-size:14px;color:#18181b;">${escapeHtml(lease.ipAddress)}</td>
          <td style="padding:10px 12px;border-bottom:1px solid #e4e4e7;font-size:14px;color:#18181b;">${escapeHtml(lease.provider)}</td>
          <td style="padding:10px 12px;border-bottom:1px solid #e4e4e7;font-size:14px;color:#18181b;">${escapeHtml(lease.assignedTo)}</td>
          <td style="padding:10px 12px;border-bottom:1px solid #e4e4e7;font-size:14px;color:#18181b;">${escapeHtml(lease.invoiceDate)}</td>
          <td style="padding:10px 12px;border-bottom:1px solid #e4e4e7;font-size:14px;color:#18181b;">${escapeHtml(lease.dueDate)}</td>
          <td style="padding:10px 12px;border-bottom:1px solid #e4e4e7;font-size:14px;font-weight:600;color:#B91C1C;">${lease.daysRemaining}</td>
        </tr>`
    )
    .join('');

  const rowsText = data.leases
    .map(
      (lease) =>
        `- ${lease.ipAddress} | provider=${lease.provider} | assigned=${lease.assignedTo} | invoice=${lease.invoiceDate} | due=${lease.dueDate} | daysLeft=${lease.daysRemaining}`
    )
    .join('\n');

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>VM host lease due soon</title>
</head>
<body style="margin:0;padding:0;background-color:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f4f5;padding:40px 0;">
    <tr>
      <td align="center">
        <table width="640" cellpadding="0" cellspacing="0" style="max-width:640px;width:100%;background:#ffffff;border-radius:8px;overflow:hidden;border:1px solid #e4e4e7;">
          <tr>
            <td style="background:#B91C1C;padding:28px 36px;text-align:center;">
              <p style="margin:0;font-size:20px;font-weight:700;color:#ffffff;">${escapeHtml(platformName)}</p>
            </td>
          </tr>
          <tr>
            <td style="padding:32px 36px;">
              <p style="margin:0 0 8px;font-size:22px;font-weight:700;color:#18181b;">VM host lease due soon</p>
              <p style="margin:0 0 20px;font-size:15px;color:#71717a;line-height:1.6;">
                The following leased VM host(s) are due within <strong>${data.warningDays}</strong> day(s). Review and renew or reclaim as needed.
              </p>
              <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e4e4e7;border-radius:8px;overflow:hidden;">
                <thead>
                  <tr style="background:#fafafa;">
                    <th align="left" style="padding:10px 12px;font-size:12px;color:#71717a;text-transform:uppercase;">IP Address</th>
                    <th align="left" style="padding:10px 12px;font-size:12px;color:#71717a;text-transform:uppercase;">Provider</th>
                    <th align="left" style="padding:10px 12px;font-size:12px;color:#71717a;text-transform:uppercase;">Assigned To</th>
                    <th align="left" style="padding:10px 12px;font-size:12px;color:#71717a;text-transform:uppercase;">Invoice</th>
                    <th align="left" style="padding:10px 12px;font-size:12px;color:#71717a;text-transform:uppercase;">Due</th>
                    <th align="left" style="padding:10px 12px;font-size:12px;color:#71717a;text-transform:uppercase;">Days left</th>
                  </tr>
                </thead>
                <tbody>
                  ${rowsHtml}
                </tbody>
              </table>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  const text = `${platformName} — VM host leases due within ${data.warningDays} day(s)

${rowsText}
`;

  return { subject, html, text };
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
