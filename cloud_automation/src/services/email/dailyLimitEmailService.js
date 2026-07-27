const { sendMailWithRetry } = require('./mailSender');

const escapeHtml = (value) =>
  String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');

const buildDailyLimitReachedEmailHtml = ({ dailyLimitHours, hoursUsed }) => `
  <!doctype html>
  <html>
    <body style="font-family: Arial, Helvetica, sans-serif; color: #111827; background: #f8fafc; margin: 0; padding: 24px;">
      <div style="max-width: 720px; margin: 0 auto; background: #ffffff; border: 1px solid #e5e7eb; border-radius: 16px; padding: 24px;">
        <h1 style="margin: 0 0 12px; font-size: 24px;">Daily usage limit reached</h1>
        <p style="margin: 0 0 16px;">
          You have used <strong>${escapeHtml(hoursUsed)} of ${escapeHtml(dailyLimitHours)} hours</strong>
          allowed for today's lab session.
        </p>
        <p style="margin: 0 0 16px;">
          Your Azure lab account has been <strong>temporarily suspended</strong> for the rest of today.
          All resources inside your lab have been deleted.
        </p>
        <p style="margin: 0 0 16px;">
          Your access will automatically resume at the start of your next scheduled window.
        </p>
        <p style="margin: 0; color: #6b7280;">— The Racko Team</p>
      </div>
    </body>
  </html>
`;

const sendDailyLimitReachedEmail = async ({ to, dailyLimitHours, consumedMinutes }) => {
  const hoursUsed = (consumedMinutes / 60).toFixed(1);
  const subject = '[Racko] Daily usage limit reached — your lab access has been paused';
  const html = buildDailyLimitReachedEmailHtml({ dailyLimitHours, hoursUsed });
  return sendMailWithRetry({ to, subject, html });
};

module.exports = {
  buildDailyLimitReachedEmailHtml,
  sendDailyLimitReachedEmail
};
