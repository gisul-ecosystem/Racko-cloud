import XLSX from 'xlsx';

const USER_TABLE_HEADERS_IAM = [
  '#',
  'Username',
  'Temporary Password',
  'Console URL',
  'AWS Account ID',
  'racko:request',
  'racko:user-index',
  'racko:user',
  'Status'
];

const USER_TABLE_HEADERS_MAGIC = [
  '#',
  'Lab Username',
  'IAM Role Name',
  'IAM Role ARN',
  'AWS Account ID',
  'racko:request',
  'racko:user-index',
  'Access Type',
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

const formatAccessType = (value) => {
  const normalized = String(value || '').trim().toLowerCase();
  if (normalized === 'magic_link') return 'Magic Link (12hr console sessions)';
  if (normalized === 'identity_center' || normalized === 'iam') return 'Direct IAM / Identity Center';
  return normalized || '';
};

const formatCostingMode = (value) => {
  const normalized = String(value || '').trim().toLowerCase();
  if (normalized === 'per_user') return 'Per-user accounts / permission sets';
  if (normalized === 'shared') return 'Shared AWS account';
  return normalized || '';
};

const buildTagsSheetRows = ({ requestId, users }) => {
  const rows = [
    ['AWS Lab Required Tags'],
    [],
    ['Why tags matter'],
    [
      'Every AWS resource you create in this lab must include Racko tags at creation time. IAM policies deny create actions without them. Supported services are also auto-tagged after creation, but create-time tags are still required to pass policy checks.'
    ],
    [],
    ['Tag reference'],
    ['Tag Key', 'Required?', 'Description', 'Example Value'],
    [
      'racko:request',
      'Always',
      'Links the resource to this lab request for cost tracking and cleanup.',
      String(requestId)
    ],
    [
      'racko:user-index',
      'Always (per user)',
      '1-based index of the lab user who owns the resource (User 1 → 1).',
      '1'
    ],
    [
      'racko:user',
      'When username exists (IAM path)',
      'IAM / console username for the lab user.',
      'labuser1'
    ],
    [],
    ['Per-user tag values for this lab'],
    ['User', 'racko:request', 'racko:user-index', 'racko:user']
  ];

  (users || []).forEach((user) => {
    rows.push([
      user.label || `User ${user.userIndex + 1}`,
      String(requestId),
      String(user.userIndex + 1),
      user.username || ''
    ]);
  });

  rows.push(
    [],
    ['How to apply tags (quick steps)'],
    ['1. Open the AWS service console (EC2, S3, RDS, Lambda, DynamoDB, EKS, etc.).'],
    ['2. Start creating the resource.'],
    ['3. Find the Tags / Tagging section before you click Create.'],
    ['4. Add racko:request and racko:user-index (and racko:user when applicable) with the values above.'],
    ['5. Complete creation. If tags are missing, AWS returns AccessDenied from the lab IAM policy.']
  );

  return rows;
};

/**
 * Build AWS lab credentials Excel (users + tags guide sheet).
 */
export function buildCredentialSpreadsheetBuffer({
  requestId,
  customerEmail,
  region,
  projectName,
  accessType,
  costingMode,
  endDate,
  awsAccountId,
  portalLink,
  portalExpiresAt,
  adminCredentials,
  allowedServices = [],
  isMagicLink = false,
  identityUsers = [],
  labRoles = []
}) {
  const requestIdStr = String(requestId);
  const metadataRows = [
    ['Request ID', requestIdStr],
    ['Project Name', projectName || ''],
    ['Customer Email', customerEmail || ''],
    ['AWS Region', region || ''],
    ['AWS Account ID', awsAccountId || ''],
    ['Access Type', formatAccessType(accessType)],
    ['Costing Mode', formatCostingMode(costingMode)],
    ['Lab Expires', formatDisplayDateTime(endDate) || (endDate ? String(endDate) : '')],
    ['Allowed Services', (allowedServices || []).join(', ')]
  ];

  metadataRows.push(
    ['Portal Link', portalLink || 'Re-send credentials or open the link from the access email.'],
    ['Portal Link Expires', formatDisplayDateTime(portalExpiresAt)],
    ['Admin Portal Username', adminCredentials?.username || ''],
    ['Admin Portal Password', adminCredentials?.temporaryPassword || adminCredentials?.password || '']
  );

  const userHeaders = isMagicLink ? USER_TABLE_HEADERS_MAGIC : USER_TABLE_HEADERS_IAM;
  const rows = [
    ['AWS Lab Credentials'],
    [],
    ...metadataRows,
    [],
    ['Learner Accounts'],
    userHeaders
  ];

  const tagUsers = [];

  if (isMagicLink) {
    (labRoles || []).forEach((role, index) => {
      const userIndex = Number.isFinite(Number(role.userIndex)) ? Number(role.userIndex) : index;
      const labUsername = `labuser${userIndex + 1}`;
      tagUsers.push({
        label: `User ${userIndex + 1}`,
        userIndex,
        username: labUsername
      });
      rows.push([
        index + 1,
        labUsername,
        role.roleName || '',
        role.roleArn || '',
        awsAccountId || '',
        requestIdStr,
        String(userIndex + 1),
        'Magic Link',
        role.suspended ? 'Suspended' : role.deletedAt ? 'Deleted' : 'Active'
      ]);
    });
  } else {
    (identityUsers || []).forEach((user, index) => {
      const userIndex = Number.isFinite(Number(user.userIndex)) ? Number(user.userIndex) : index;
      tagUsers.push({
        label: `User ${userIndex + 1}`,
        userIndex,
        username: user.username || null
      });
      rows.push([
        index + 1,
        user.username || '',
        user.password || '',
        user.consoleUrl || '',
        user.awsAccountId || user.accountId || awsAccountId || '',
        requestIdStr,
        String(userIndex + 1),
        user.username || '',
        user.suspended ? 'Suspended' : user.deletedAt ? 'Deleted' : 'Created'
      ]);
    });
  }

  const worksheet = XLSX.utils.aoa_to_sheet(rows);
  const lastColumnIndex = userHeaders.length - 1;

  worksheet['!cols'] = userHeaders.map((header) => ({
    wch: Math.min(48, Math.max(14, String(header).length + 6))
  }));

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
      portalCell.l = { Target: portalLink, Tooltip: 'Open AWS manage portal' };
    }
  }

  const learnerCount = isMagicLink ? (labRoles || []).length : (identityUsers || []).length;
  const headerRowIndex = rows.length - learnerCount - 1;
  worksheet['!autofilter'] = {
    ref: XLSX.utils.encode_range({
      s: { r: headerRowIndex, c: 0 },
      e: { r: rows.length - 1, c: lastColumnIndex }
    })
  };

  if (learnerCount > 0) {
    worksheet['!freeze'] = {
      xSplit: 0,
      ySplit: headerRowIndex + 1,
      topLeftCell: XLSX.utils.encode_cell({ r: headerRowIndex + 1, c: 0 }),
      activePane: 'bottomLeft',
      state: 'frozen'
    };
  }

  const tagsSheet = XLSX.utils.aoa_to_sheet(
    buildTagsSheetRows({ requestId: requestIdStr, users: tagUsers })
  );
  tagsSheet['!cols'] = [{ wch: 22 }, { wch: 28 }, { wch: 64 }, { wch: 28 }];

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Credentials');
  XLSX.utils.book_append_sheet(workbook, tagsSheet, 'Required Tags');

  return XLSX.write(workbook, {
    type: 'buffer',
    bookType: 'xlsx',
    compression: true
  });
}

export function buildCredentialSpreadsheetFilename(requestId) {
  return `aws-lab-credentials-request-${requestId}.xlsx`;
}
