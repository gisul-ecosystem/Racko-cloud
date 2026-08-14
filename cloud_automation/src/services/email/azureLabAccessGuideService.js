const {
  AlignmentType,
  BorderStyle,
  Document,
  HeadingLevel,
  Packer,
  Paragraph,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType
} = require('docx');

const heading = (text, level = HeadingLevel.HEADING_1) =>
  new Paragraph({
    text,
    heading: level,
    spacing: { before: 280, after: 120 }
  });

const para = (text, options = {}) =>
  new Paragraph({
    spacing: { after: 120 },
    children: [
      new TextRun({
        text,
        bold: Boolean(options.bold),
        size: 22,
        color: options.color || '111827'
      })
    ]
  });

const note = (text) =>
  new Paragraph({
    spacing: { after: 140 },
    children: [
      new TextRun({ text: 'Note: ', bold: true, color: 'B91C1C', size: 22 }),
      new TextRun({ text, size: 22, color: '374151' })
    ]
  });

const bullet = (text) =>
  new Paragraph({
    spacing: { after: 60 },
    bullet: { level: 0 },
    children: [new TextRun({ text, size: 22 })]
  });

const numbered = (text, reference = 'steps-portal') =>
  new Paragraph({
    spacing: { after: 60 },
    numbering: { reference, level: 0 },
    children: [new TextRun({ text, size: 22 })]
  });

const cell = (text, opts = {}) =>
  new TableCell({
    width: { size: opts.width || 1800, type: WidthType.DXA },
    borders: {
      top: { style: BorderStyle.SINGLE, size: 4, color: 'CBD5E1' },
      bottom: { style: BorderStyle.SINGLE, size: 4, color: 'CBD5E1' },
      left: { style: BorderStyle.SINGLE, size: 4, color: 'CBD5E1' },
      right: { style: BorderStyle.SINGLE, size: 4, color: 'CBD5E1' }
    },
    children: [
      new Paragraph({
        children: [
          new TextRun({
            text: String(text ?? ''),
            bold: Boolean(opts.bold),
            size: 18,
            color: opts.header ? '1E3A8A' : '111827'
          })
        ]
      })
    ]
  });

const simpleTable = (rows) => {
  const colCount = Math.max(...rows.map((row) => row.length), 1);
  const width = Math.floor(9000 / colCount);

  return new Table({
    width: { size: 9000, type: WidthType.DXA },
    rows: rows.map(
      (row, rowIndex) =>
        new TableRow({
          children: row.map((value) =>
            cell(value, {
              bold: rowIndex === 0,
              header: rowIndex === 0,
              width
            })
          )
        })
    )
  });
};

const numberingLevel = (reference) => ({
  reference,
  levels: [
    {
      level: 0,
      format: 'decimal',
      text: '%1.',
      alignment: AlignmentType.LEFT
    }
  ]
});

const formatDisplayDate = (value) => {
  if (!value) return 'as shown in your email';
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    return String(value);
  }
  return date.toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric'
  });
};

const formatIdMode = (value) => {
  const normalized = String(value || '').trim().toLowerCase();
  if (normalized === 'test_ids') return 'Azure test IDs (short-lived)';
  if (normalized === 'azure_ids') return 'Azure IDs (full lab)';
  return normalized || 'Azure lab';
};

const formatCostingMode = (value) => {
  const normalized = String(value || '').trim().toLowerCase();
  if (normalized === 'per_user') return 'Per-user resource groups';
  if (normalized === 'shared') return 'Shared resource group';
  return normalized || 'As configured for the lab';
};

/**
 * Build a polished Azure Lab Access guide (DOCX buffer).
 * Personalized with request portal link, region, users, and lab settings.
 */
const buildAzureLabAccessGuideBuffer = async ({
  requestId,
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
  users = []
} = {}) => {
  const requestIdStr = requestId ? String(requestId) : '<your-request-id>';
  const expiresLabel = formatDisplayDate(expiresAt || expiryDate);
  const portalExpiresLabel = formatDisplayDate(portalExpiresAt);
  const adminUsername = adminCredentials?.username || 'Shown in email / Excel';
  const learnerCount = Array.isArray(users) ? users.length : 0;

  const userPreviewRows = (users || []).slice(0, 12).map((user, index) => [
    String(index + 1),
    user.username || '',
    user.resource_group_name || sharedResourceGroup || '—',
    user.status || 'active'
  ]);

  const children = [
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 80 },
      children: [
        new TextRun({
          text: 'Racko Azure Lab Access Guide',
          bold: true,
          size: 36,
          color: 'B91C1C'
        })
      ]
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 60 },
      children: [
        new TextRun({
          text: 'Step-by-step instructions for Manage Portal login and Azure Portal access',
          size: 20,
          color: '4B5563'
        })
      ]
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 240 },
      children: [
        new TextRun({
          text: 'Version 1.0  |  Racko Cloud Platform',
          size: 18,
          color: '6B7280'
        })
      ]
    }),

    heading('1. Overview'),
    para(
      'When your Azure lab is provisioned, Racko emails the lab contact with Manage Portal credentials, learner accounts, an Excel spreadsheet, and this Word guide. Use the Manage Portal to administer the lab and open the Microsoft Azure Portal for hands-on work.'
    ),
    para('This guide covers:', { bold: true }),
    bullet('Signing in to the Racko Manage Portal (administrator and learner).'),
    bullet('Opening the Microsoft Azure Portal from the Manage Portal.'),
    bullet('Understanding what each email attachment contains.'),
    bullet('Troubleshooting common login and access issues.'),

    heading('2. Who should use this guide?'),
    bullet('Lab Administrator / Instructor — manages all users, roles, cleanup, and console access.'),
    bullet('Lab Learner / Participant — signs in to My Account and opens Azure for lab exercises.'),

    heading('3. What you receive by email'),
    bullet('Manage Portal URL with a secure token, plus admin username and temporary password.'),
    bullet('A table of learner usernames, temporary passwords, and Azure User IDs.'),
    bullet('An Excel attachment (azure-lab-credentials-request-….xlsx) for distribution.'),
    bullet('This Word guide (Azure-Lab-Access-Guide.docx) for step-by-step login help.'),
    note(
      'Treat credentials as confidential. Share each learner row only with that learner. Do not post passwords or portal links publicly.'
    ),

    heading('4. Lab summary for this request'),
    simpleTable([
      ['Field', 'Value'],
      ['Request ID', requestIdStr],
      ['Project', projectName || 'Shown in email / Excel'],
      ['Region / location', location || 'Shown in email / Excel'],
      ['ID mode', formatIdMode(idMode)],
      ['Costing mode', formatCostingMode(costingMode)],
      ['Shared resource group', sharedResourceGroup || 'Per-user / as configured'],
      ['Lab expires', expiresLabel],
      ['Portal link expires', portalExpiresLabel],
      ['Learner accounts', String(learnerCount || 'Shown in Excel')],
      ['Admin username', adminUsername],
      ['Portal link', portalLink || 'Use the Open Manage Portal button in the email']
    ]),

    heading('5. Step-by-step: Sign in to the Manage Portal'),
    heading('5.1 Lab administrator', HeadingLevel.HEADING_2),
    numbered('Open the “Your Azure Access Portal” email on your computer.', 'steps-portal'),
    numbered(
      'Click Open Admin Portal / Open Manage Portal (or paste the full token URL into your browser).',
      'steps-portal'
    ),
    numbered('On the Manage Portal Login page, enter the Admin Portal username from the email.', 'steps-portal'),
    numbered('Enter the Admin Portal temporary password exactly as shown.', 'steps-portal'),
    numbered('Click Sign In.', 'steps-portal'),
    numbered(
      'You land on the Manage Portal dashboard listing all lab users, roles, spend/limits, and console actions.',
      'steps-portal'
    ),

    heading('5.2 Lab learner', HeadingLevel.HEADING_2),
    numbered(
      'Receive your username and temporary password from your instructor (from the Excel sheet or email).',
      'steps-learner'
    ),
    numbered('Open the same Manage Portal link provided by your instructor.', 'steps-learner'),
    numbered(
      'On the Manage Portal Login page, enter your Azure username (or Azure User ID) and temporary password.',
      'steps-learner'
    ),
    numbered('Click Sign In.', 'steps-learner'),
    numbered(
      'You land on My Account — review your status, assigned roles, limits, and Open Azure Console.',
      'steps-learner'
    ),
    note(
      'You must use the secure link from the email (it includes ?token=…). Opening /manage-users without the token will show “Access link required” and fail.'
    ),

    heading('6. Step-by-step: Open the Azure Portal'),
    para(
      'Hands-on lab work happens in the Microsoft Azure Portal. Always launch it from the Manage Portal — do not try to sign in to Azure without going through Racko first.'
    ),
    numbered('Sign in to the Manage Portal (Section 5).', 'steps-console'),
    numbered(
      'Learners: on My Account click Open Azure Console. Administrators: use Open Azure Console on the learner’s row.',
      'steps-console'
    ),
    numbered('A new browser tab opens the Microsoft Azure sign-in page.', 'steps-console'),
    numbered('Your Azure username (UPN) is usually pre-filled.', 'steps-console'),
    numbered(
      'Your temporary password is copied to the clipboard when possible. If not, copy it from the on-screen message or Excel sheet.',
      'steps-console'
    ),
    numbered('Paste the temporary password on the Microsoft login page and complete sign-in.', 'steps-console'),
    numbered(
      'If prompted for MFA or a password change, follow your instructor’s guidance.',
      'steps-console'
    ),
    numbered(
      'Once signed in, Azure Portal opens. You may land in your assigned resource group when configured.',
      'steps-console'
    ),
    numbered('Begin your lab exercises in Azure.', 'steps-console'),
    note(
      'The Azure AD temporary password is for Microsoft sign-in. It is separate from Manage Portal login, though they may match when first provisioned.'
    ),

    heading('6.1 End-to-end flow (quick reference)', HeadingLevel.HEADING_2),
    para(
      'Email → Open Manage Portal (?token=…) → Sign in (admin or learner) → Open Azure Console → Paste temp password on Microsoft login → Work in Azure'
    ),

    heading('7. Manage Portal features'),
    heading('7.1 For administrators', HeadingLevel.HEADING_2),
    bullet('View all provisioned users, status, and assigned Azure roles.'),
    bullet('Update RBAC roles or remove users when access is no longer needed.'),
    bullet('Monitor daily usage limits and spend (when configured).'),
    bullet('Launch Azure Console for any learner from the dashboard.'),
    bullet('Use the Excel attachment to distribute credentials safely.'),

    heading('7.2 For learners (My Account)', HeadingLevel.HEADING_2),
    bullet('View your username, Azure User ID, expiry, and assigned roles.'),
    bullet('See daily usage remaining when usage windows are enabled.'),
    bullet('Use Open Azure Console to launch the Microsoft Azure Portal.'),
    bullet('Use only your own credentials — never another learner’s password.'),

    ...(userPreviewRows.length
      ? [
          heading('7.3 Learner accounts on this request (preview)', HeadingLevel.HEADING_2),
          simpleTable([
            ['#', 'Username', 'Resource group', 'Status'],
            ...userPreviewRows
          ]),
          para(
            learnerCount > userPreviewRows.length
              ? `Showing first ${userPreviewRows.length} of ${learnerCount} users. See the Excel attachment for the full list and passwords.`
              : 'Passwords are only in the email and Excel attachment — not repeated here for security.'
          )
        ]
      : []),

    heading('8. Security notes'),
    bullet('Do not share admin portal credentials with learners.'),
    bullet('Do not share one learner’s password with another learner.'),
    bullet('Portal access links expire when the lab ends. Ask admin to resend if expired.'),
    bullet('Manage Portal sessions end when you close the tab or the session times out.'),
    bullet('Lab access ends on the lab expiry date; resources may be cleaned up automatically.'),

    heading('9. Troubleshooting'),
    simpleTable([
      ['Issue', 'What to do'],
      [
        'Portal says access link required / invalid token',
        'Open the full URL from the email (includes ?token=…). Ask admin to resend credentials if expired.'
      ],
      [
        'Cannot sign in to Manage Portal',
        'Admins use admin credentials; learners use their exact Azure username/User ID and password from Excel. Check Caps Lock.'
      ],
      [
        'Link no longer valid / expired',
        'The secure link expired or was already used. Ask your Racko administrator to resend credentials from the request page.'
      ],
      [
        'Open Azure Console does nothing',
        'Allow pop-ups for the portal site, then try again.'
      ],
      [
        'Azure login fails after console launch',
        'Paste the latest temporary password from Excel/email. Contact admin if access was rotated, revoked, or expired.'
      ],
      [
        'Daily usage limit reached',
        'Wait until the next day or ask your administrator to adjust limits.'
      ],
      [
        'Wrong resource group / access denied in Azure',
        'Confirm you signed in with your own account and opened console from your Manage Portal row.'
      ]
    ]),

    heading('10. Support'),
    para(
      'For access issues, contact your lab administrator or Racko support at info@racko.ai. Include your request ID, username (or Azure User ID), and the exact error message from the Manage Portal or Microsoft login page.'
    ),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: 300 },
      children: [
        new TextRun({ text: '— End of document —', italics: true, color: '6B7280', size: 20 })
      ]
    })
  ];

  const doc = new Document({
    numbering: {
      config: [
        numberingLevel('steps-portal'),
        numberingLevel('steps-learner'),
        numberingLevel('steps-console')
      ]
    },
    sections: [
      {
        properties: {
          page: {
            margin: { top: 720, bottom: 720, left: 720, right: 720 }
          }
        },
        children
      }
    ]
  });

  return Packer.toBuffer(doc);
};

const buildAzureLabAccessGuideFilename = (requestId) =>
  requestId
    ? `Azure-Lab-Access-Guide-request-${requestId}.docx`
    : 'Azure-Lab-Access-Guide.docx';

module.exports = {
  buildAzureLabAccessGuideBuffer,
  buildAzureLabAccessGuideFilename
};
