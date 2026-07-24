const XLSX = require('xlsx');

const USER_TABLE_HEADERS = [
  '#',
  'Username',
  'Temporary Password',
  'Resource Group',
  'Azure User ID',
  'Status'
];

const formatDisplayDateTime = (value) => {
  if (!value) return '';

  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    return String(value);
  }

  return date.toLocaleString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: 'UTC'
  });
};

const formatIdMode = (value) => {
  const normalized = String(value || '').trim().toLowerCase();
  if (normalized === 'test_ids') return 'Azure test_ids';
  if (normalized === 'azure_ids') return 'Azure IDs';
  return normalized ? normalized : '';
};

const formatCostingMode = (value) => {
  const normalized = String(value || '').trim().toLowerCase();
  if (normalized === 'per_user') return 'Per-user resource groups';
  if (normalized === 'shared') return 'Shared resource group';
  return normalized ? normalized : '';
};

const buildCredentialSpreadsheetBuffer = ({
  requestId,
  customerEmail,
  location,
  projectName,
  idMode,
  costingMode,
  expiryDate,
  expiresAt,
  sharedResourceGroup,
  portalLink,
  portalExpiresAt,
  adminCredentials,
  users
}) => {
  const normalizedUsers = Array.isArray(users) ? users : [];
  const metadataRows = [
    ['Request ID', requestId ?? ''],
    ['Project Name', projectName || ''],
    ['Customer Email', customerEmail || ''],
    ['Lab Region', location || ''],
    ['ID Mode', formatIdMode(idMode)],
    ['Costing Mode', formatCostingMode(costingMode)],
    [
      'Lab Expires',
      formatDisplayDateTime(expiresAt || expiryDate) ||
        (expiryDate ? String(expiryDate) : '')
    ]
  ];

  if (String(costingMode || '').trim().toLowerCase() !== 'per_user') {
    metadataRows.push(['Shared Resource Group', sharedResourceGroup || '']);
  }

  metadataRows.push(
    [
      'Portal Link',
      portalLink || 'Re-send credentials to generate a fresh portal link.'
    ],
    ['Portal Link Expires', formatDisplayDateTime(portalExpiresAt)],
    ['Admin Portal Username', adminCredentials?.username || ''],
    ['Admin Portal Password', adminCredentials?.temporaryPassword || '']
  );

  const rows = [['Azure Lab Credentials'], [], ...metadataRows, [], ['Learner Accounts'], USER_TABLE_HEADERS];

  normalizedUsers.forEach((user, index) => {
    rows.push([
      index + 1,
      user.username || '',
      user.temporary_password || user.temporaryPassword || '',
      user.resource_group_name || user.resourceGroup || '',
      user.azure_user_id || user.azureUserId || '',
      user.status || 'Created'
    ]);
  });

  const worksheet = XLSX.utils.aoa_to_sheet(rows);
  const lastColumnIndex = USER_TABLE_HEADERS.length - 1;

  worksheet['!cols'] = [
    { wch: 8 },
    { wch: 28 },
    { wch: 24 },
    { wch: 28 },
    { wch: 40 },
    { wch: 14 }
  ];

  worksheet['!merges'] = [
    { s: { r: 0, c: 0 }, e: { r: 0, c: lastColumnIndex } },
    {
      s: { r: metadataRows.length + 3, c: 0 },
      e: { r: metadataRows.length + 3, c: lastColumnIndex }
    }
  ];

  const portalLinkRowIndex = metadataRows.findIndex((entry) => entry[0] === 'Portal Link') + 2;
  if (portalLink && portalLinkRowIndex >= 2) {
    const portalCell = worksheet[XLSX.utils.encode_cell({ r: portalLinkRowIndex, c: 1 })];
    if (portalCell) {
      portalCell.l = { Target: portalLink, Tooltip: 'Open admin portal' };
    }
  }

  const headerRowIndex = rows.length - normalizedUsers.length - 1;
  worksheet['!autofilter'] = {
    ref: XLSX.utils.encode_range({
      s: { r: headerRowIndex, c: 0 },
      e: { r: rows.length - 1, c: lastColumnIndex }
    })
  };

  if (normalizedUsers.length > 0) {
    worksheet['!freeze'] = {
      xSplit: 0,
      ySplit: headerRowIndex + 1,
      topLeftCell: XLSX.utils.encode_cell({ r: headerRowIndex + 1, c: 0 }),
      activePane: 'bottomLeft',
      state: 'frozen'
    };
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
