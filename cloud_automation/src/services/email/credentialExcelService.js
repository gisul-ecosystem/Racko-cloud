const XLSX = require('xlsx');

const buildCredentialSpreadsheetBuffer = ({
  requestId,
  customerEmail,
  location,
  portalLink,
  portalExpiresAt,
  adminCredentials,
  users
}) => {
  const rows = [
    ['Azure Lab Credentials'],
    [],
    ['Request ID', requestId],
    ['Customer Email', customerEmail || ''],
    ['Lab Region', location || ''],
    ['Portal Link', portalLink || 'Re-send credentials to generate a fresh portal link.'],
    ['Portal Link Expires', portalExpiresAt ? new Date(portalExpiresAt).toISOString() : ''],
    ['Admin Portal Username', adminCredentials?.username || ''],
    ['Admin Portal Password', adminCredentials?.temporaryPassword || ''],
    [],
    ['#', 'Username', 'Temporary Password', 'Azure User ID', 'Status']
  ];

  const normalizedUsers = Array.isArray(users) ? users : [];

  normalizedUsers.forEach((user, index) => {
    rows.push([
      index + 1,
      user.username || '',
      user.temporary_password || user.temporaryPassword || '',
      user.azure_user_id || user.azureUserId || '',
      user.status || 'active'
    ]);
  });

  const worksheet = XLSX.utils.aoa_to_sheet(rows);
  worksheet['!cols'] = [
    { wch: 6 },
    { wch: 34 },
    { wch: 22 },
    { wch: 40 },
    { wch: 14 }
  ];

  if (portalLink) {
    const portalCell = worksheet[XLSX.utils.encode_cell({ r: 5, c: 1 })];
    if (portalCell) {
      portalCell.l = { Target: portalLink, Tooltip: 'Open admin portal' };
    }
  }

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Credentials');

  return XLSX.write(workbook, {
    type: 'buffer',
    bookType: 'xlsx',
    compression: true
  });
};

const buildCredentialSpreadsheetFilename = (requestId) =>
  `azure-lab-credentials-request-${requestId}.xlsx`;

module.exports = {
  buildCredentialSpreadsheetBuffer,
  buildCredentialSpreadsheetFilename
};
