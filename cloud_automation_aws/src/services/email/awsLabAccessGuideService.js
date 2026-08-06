import {
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
} from 'docx';

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

/**
 * Build a polished AWS Lab Access + Tags guide (DOCX buffer).
 */
export async function buildAwsLabAccessGuideBuffer({
  requestId,
  region,
  awsAccountId,
  accessType,
  endDate,
  portalLink,
  allowedServices = [],
  isMagicLink = false,
  identityUsers = [],
  labRoles = []
} = {}) {
  const requestIdStr = requestId ? String(requestId) : '<your-request-id>';
  const accessLabel = isMagicLink
    ? 'Magic Link (12-hour console sessions)'
    : 'Direct IAM / Identity Center login';
  const expiresLabel = endDate
    ? new Date(endDate).toLocaleDateString('en-GB', {
        day: '2-digit',
        month: 'short',
        year: 'numeric'
      })
    : 'as shown in your email';

  const userRows = isMagicLink
    ? (labRoles || []).map((role, index) => {
        const userIndex = Number.isFinite(Number(role.userIndex)) ? Number(role.userIndex) : index;
        return [
          `User ${userIndex + 1}`,
          `labuser${userIndex + 1}`,
          String(userIndex + 1),
          `labuser${userIndex + 1}`
        ];
      })
    : (identityUsers || []).map((user, index) => {
        const userIndex = Number.isFinite(Number(user.userIndex)) ? Number(user.userIndex) : index;
        return [
          `User ${userIndex + 1}`,
          user.username || `labuser${userIndex + 1}`,
          String(userIndex + 1),
          user.username || ''
        ];
      });

  const children = [
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 80 },
      children: [
        new TextRun({ text: 'Racko AWS Lab Access Guide', bold: true, size: 36, color: 'B91C1C' })
      ]
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 60 },
      children: [
        new TextRun({
          text: 'Step-by-step instructions for Manage Portal, AWS Console access, and required resource tags',
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
      'When your AWS lab is provisioned, Racko emails the lab contact with Manage Portal credentials, learner account details, an Excel spreadsheet of users, and this Word guide. Use the Manage Portal to administer the lab and launch AWS Console access for each learner.'
    ),
    para('This guide covers:', { bold: true }),
    bullet('Signing in to the Racko Manage Portal (admin and learner).'),
    bullet('Opening the AWS Console (Magic Link or IAM credentials).'),
    bullet('Applying the required Racko tags when creating AWS resources.'),
    bullet('Troubleshooting common access and tagging issues.'),

    heading('2. Who should use this guide?'),
    bullet('Lab Administrator / Instructor — manages all users, budgets, cleanup, and console links.'),
    bullet('Lab Learner / Participant — signs in (or uses a magic link) and works hands-on in AWS.'),

    heading('3. What you receive by email'),
    bullet('Manage Portal URL with a secure token, plus admin username and temporary password.'),
    bullet('An Excel attachment (aws-lab-credentials-request-….xlsx) listing every lab user.'),
    bullet('This Word guide (AWS-Lab-Access-Guide.docx) for step-by-step access and tagging.'),
    bullet('Required tag values for this lab (also on the Excel “Required Tags” sheet).'),
    note(
      'Treat credentials as confidential. Share each learner row only with that learner. Do not post passwords or portal links publicly.'
    ),

    heading('4. Lab summary for this request'),
    simpleTable([
      ['Field', 'Value'],
      ['Request ID', requestIdStr],
      ['AWS Account', awsAccountId || 'Shown in email / Excel'],
      ['Region', region || 'Shown in email / Excel'],
      ['Access type', accessLabel],
      ['Lab expires', expiresLabel],
      ['Services', (allowedServices || []).join(', ') || 'As selected for the lab'],
      ['Portal link', portalLink || 'Use the Open Manage Portal button in the email']
    ]),

    heading('5. Step-by-step: Sign in to the Manage Portal'),
    heading('5.1 Lab administrator', HeadingLevel.HEADING_2),
    numbered('Open the “AWS Lab Access Ready” email on your computer.', 'steps-portal'),
    numbered('Click Open Manage Portal (or paste the full token URL into your browser).', 'steps-portal'),
    numbered('Enter the Admin Portal username from the email (also in the Excel metadata section).', 'steps-portal'),
    numbered('Enter the Admin Portal temporary password.', 'steps-portal'),
    numbered('Click Sign In.', 'steps-portal'),
    numbered(
      'You land on the Manage Portal dashboard listing all lab users, spend, cleanup controls, and console launch actions.',
      'steps-portal'
    ),

    heading('5.2 Lab learner (when learner portal login is enabled)', HeadingLevel.HEADING_2),
    numbered(
      'Receive your username and password from your instructor (from the Excel sheet or email).',
      'steps-learner'
    ),
    numbered('Open the Manage Portal link provided by your instructor.', 'steps-learner'),
    numbered('Sign in with your lab username and temporary password.', 'steps-learner'),
    numbered(
      'Review your account status, limits, and any console launch options shown for you.',
      'steps-learner'
    ),
    note(
      'You must use the secure link from the email (it includes a token). Opening /manage-users/aws without the token will fail.'
    ),

    heading('6. Step-by-step: Open the AWS Console'),
    ...(isMagicLink
      ? [
          heading('6.1 Magic Link access (this lab)', HeadingLevel.HEADING_2),
          para(
            'This lab uses Magic Links. Learners do not type an AWS password. The administrator generates a one-click console URL from the Manage Portal.'
          ),
          numbered('Administrator signs in to the Manage Portal (Section 5.1).', 'steps-console'),
          numbered('Find the learner row (for example labuser1).', 'steps-console'),
          numbered('Click Launch AWS Console for that user.', 'steps-console'),
          numbered('Copy the magic link and share it only with that learner.', 'steps-console'),
          numbered('Learner opens the link → lands directly in the AWS Console.', 'steps-console'),
          numbered(
            'Links expire after about 12 hours. Generate a fresh link anytime from the portal.',
            'steps-console'
          ),
          note(
            'Magic links are personal. Never reuse one learner’s link for another learner — tagging and spend attribution depend on the correct user.'
          )
        ]
      : [
          heading('6.1 Direct IAM / Identity Center access (this lab)', HeadingLevel.HEADING_2),
          para(
            'This lab uses IAM (or Identity Center) usernames and passwords. Each learner has a Console URL in the Excel sheet and email.'
          ),
          numbered('Open the Excel attachment and find your assigned username row.', 'steps-console'),
          numbered('Copy the Console URL and open it in a browser.', 'steps-console'),
          numbered('Enter the Username and Temporary Password exactly as shown.', 'steps-console'),
          numbered('You land in the AWS Console for this lab account/region.', 'steps-console'),
          numbered(
            'You can sign in again anytime until the lab end date using the same credentials.',
            'steps-console'
          )
        ]),

    heading('6.2 End-to-end flow (quick reference)', HeadingLevel.HEADING_2),
    para(
      isMagicLink
        ? 'Email → Open Manage Portal → Launch AWS Console → Share magic link → Learner works in AWS (with required tags)'
        : 'Email / Excel → Open Console URL → Sign in with IAM username & password → Work in AWS (with required tags)'
    ),

    heading('7. Required AWS tags (read carefully)'),
    para(
      'Racko enforces tagging with IAM policies. When you create EC2, S3, RDS, Lambda, DynamoDB, EKS, and other supported resources, you must apply the tags below at creation time. If tags are missing, create calls are denied (AccessDenied).',
      { bold: true }
    ),

    heading('7.1 Tag definitions', HeadingLevel.HEADING_2),
    simpleTable([
      ['Tag key', 'Required', 'Meaning'],
      [
        'racko:request',
        'Always',
        `Must equal this lab’s request ID (${requestIdStr}). Used for cost tracking and cleanup.`
      ],
      [
        'racko:user-index',
        'Always (per user)',
        '1-based index of the learner (User 1 → 1, User 2 → 2). Used for per-user spend and cleanup.'
      ],
      [
        'racko:user',
        'When username exists',
        'IAM/console username (for example labuser1). Required on the IAM user path when the username is present.'
      ]
    ]),

    heading('7.2 Exact tag values for this lab', HeadingLevel.HEADING_2),
    ...(userRows.length
      ? [
          simpleTable([
            ['User', 'Username', 'racko:request', 'racko:user-index', 'racko:user'],
            ...userRows.map((row) => [row[0], row[1], requestIdStr, row[2], row[3]])
          ])
        ]
      : [
          para(
            `Use racko:request = ${requestIdStr} and racko:user-index = your assigned user number from the Excel sheet.`
          )
        ]),

    heading('7.3 Step-by-step: Apply tags when creating a resource', HeadingLevel.HEADING_2),
    numbered('Sign in to the AWS Console for your assigned lab user (Section 6).', 'steps-tags'),
    numbered(
      'Open the service you need (for example EC2 → Instances → Launch instance, or S3 → Create bucket).',
      'steps-tags'
    ),
    numbered('Fill in the normal create form (name, size, region settings, etc.).', 'steps-tags'),
    numbered(
      'Before you click Create / Launch, open the Tags, Tagging, or Additional tags section.',
      'steps-tags'
    ),
    numbered(`Add tag racko:request with value ${requestIdStr}.`, 'steps-tags'),
    numbered('Add tag racko:user-index with your user number (for User 3 use 3).', 'steps-tags'),
    numbered(
      'If you have an IAM username, add tag racko:user with that exact username.',
      'steps-tags'
    ),
    numbered('Review tags, then create the resource.', 'steps-tags'),
    numbered(
      'If creation fails with AccessDenied related to tagging, re-check that all required tags match the Excel values exactly (no extra spaces).',
      'steps-tags'
    ),

    heading('7.4 Example — EC2 instance', HeadingLevel.HEADING_2),
    bullet('EC2 → Launch instance → scroll to Tags → Add tag.'),
    bullet(`Key: racko:request   Value: ${requestIdStr}`),
    bullet('Key: racko:user-index   Value: <your index, e.g. 1>'),
    bullet('Key: racko:user   Value: <your username if applicable>'),
    bullet('Launch instance.'),

    heading('7.5 Example — S3 bucket', HeadingLevel.HEADING_2),
    bullet('S3 → Create bucket → enter bucket name and region.'),
    bullet('Open Tags → Add tag and enter the same three Racko tags.'),
    bullet('Create bucket.'),

    heading('7.6 Auto-tagger', HeadingLevel.HEADING_2),
    para(
      'Racko may auto-tag supported resources shortly after creation. Auto-tagging does not replace create-time tags. You still must set tags in the create form so IAM allow policies succeed.'
    ),

    heading('8. Manage Portal features'),
    heading('8.1 For administrators', HeadingLevel.HEADING_2),
    bullet('View all lab users and suspension / budget status.'),
    bullet('Launch AWS Console / magic links per user.'),
    bullet('Sync spend, renew budgets, and trigger cleanup.'),
    bullet('Suspend or reinstate individual users.'),

    heading('8.2 For learners', HeadingLevel.HEADING_2),
    bullet('View your assigned account details and limits (when learner login is enabled).'),
    bullet('Use only your own credentials or magic link.'),
    bullet('Always tag resources with your racko:user-index.'),

    heading('9. Security notes'),
    bullet('Do not share admin portal credentials with learners.'),
    bullet('Do not share one learner’s password or magic link with another learner.'),
    bullet('Magic links expire (~12 hours); regenerate from the portal when needed.'),
    bullet('Lab access ends on the lab expiry date; resources may be cleaned up automatically.'),

    heading('10. Troubleshooting'),
    simpleTable([
      ['Issue', 'What to do'],
      [
        'Portal says access link required / invalid token',
        'Open the full URL from the email (includes ?token=…). Ask admin to resend credentials if expired.'
      ],
      [
        'Cannot sign in to Manage Portal',
        'Use admin credentials for admin login, or your exact lab username/password from Excel. Check Caps Lock.'
      ],
      [
        'Magic link expired',
        'Admin regenerates Launch AWS Console from the Manage Portal and shares the new link.'
      ],
      [
        'AccessDenied when creating a resource',
        'Add racko:request and racko:user-index (and racko:user if required) at create time with exact Excel values.'
      ],
      [
        'Wrong cost showing on my user',
        'Confirm you used your own racko:user-index. Resources tagged with another index attribute spend to that user.'
      ],
      [
        'Service not allowed',
        'Only selected lab services are permitted. Check Allowed Services in the email / Excel metadata.'
      ]
    ]),

    heading('11. Support'),
    para(
      'For access issues, contact your lab administrator or Racko support at info@racko.ai. Include your request ID, username (or user index), region, and the exact error message from AWS or the Manage Portal.'
    ),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: 300 },
      children: [new TextRun({ text: '— End of document —', italics: true, color: '6B7280', size: 20 })]
    })
  ];

  const doc = new Document({
    numbering: {
      config: [
        numberingLevel('steps-portal'),
        numberingLevel('steps-learner'),
        numberingLevel('steps-console'),
        numberingLevel('steps-tags')
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
}

export function buildAwsLabAccessGuideFilename(requestId) {
  return requestId
    ? `AWS-Lab-Access-Guide-request-${requestId}.docx`
    : 'AWS-Lab-Access-Guide.docx';
}
