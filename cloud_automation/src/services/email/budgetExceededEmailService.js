const { sendMailWithRetry } = require('./mailSender');

const escapeHtml = (value) =>
  String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');

const buildBudgetExceededEmailHtml = ({ requestLabel }) => `
  <!doctype html>
  <html>
    <body style="font-family: Arial, Helvetica, sans-serif; color: #111827; background: #f8fafc; margin: 0; padding: 24px;">
      <div style="max-width: 720px; margin: 0 auto; background: #ffffff; border: 1px solid #e5e7eb; border-radius: 16px; padding: 24px;">
        <h1 style="margin: 0 0 12px; font-size: 24px;">Azure budget exceeded</h1>
        <p style="margin: 0 0 16px;">
          Your Azure lab account for <strong>${escapeHtml(requestLabel)}</strong> has been
          <strong>suspended</strong> because your usage has exceeded the allocated budget.
        </p>
        <p style="margin: 0 0 16px;">
          Please contact your lab administrator to review your usage or request a budget increase.
        </p>
        <p style="margin: 0 0 16px;">
          If you believe this is an error, please reach out to your Racko admin immediately.
        </p>
        <p style="margin: 0; color: #6b7280;">— The Racko Team</p>
      </div>
    </body>
  </html>
`;

const sendBudgetExceededEmailWithRetry = async ({ to, requestLabel }) => {
  const subject = `[Racko] Azure budget exceeded — your account has been suspended`;
  const html = buildBudgetExceededEmailHtml({ requestLabel });
  return sendMailWithRetry({ to, subject, html });
};

module.exports = {
  buildBudgetExceededEmailHtml,
  sendBudgetExceededEmailWithRetry
};
