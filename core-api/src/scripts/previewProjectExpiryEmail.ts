/**
 * Render the project expiry warning email to an HTML file (and optionally send a test).
 *
 * Usage:
 *   npm run preview:project-expiry-email
 *   npm run preview:project-expiry-email -- --project-id <mongoId>
 *   npm run preview:project-expiry-email -- --send you@example.com
 *   npm run preview:project-expiry-email -- --send a@x.com --send b@y.com --project-id <mongoId>
 *
 * When sending, loads a real project from MongoDB so email links work.
 * Without --project-id, uses the first active org project found.
 */
import fs from 'fs';
import path from 'path';
import mongoose from 'mongoose';
import { config } from '../config';
import { connectDatabase, disconnectDatabase } from '../config/database';
import { ProjectModel, type IProject } from '../models/project.model';
import { buildProjectExpiryWarningTemplate } from '../utils/email/templates/projectExpiryWarning';
import { formatProjectDateLabel } from '../modules/projects/projectExpiryDates';

const args = process.argv.slice(2);

function readFlag(name: string): string | undefined {
  const index = args.indexOf(name);
  if (index >= 0 && args[index + 1]) return args[index + 1];
  return undefined;
}

const sendTargets: string[] = [];
for (let i = 0; i < args.length; i += 1) {
  if (args[i] === '--send' && args[i + 1]) {
    sendTargets.push(args[i + 1]);
    i += 1;
  }
}

const projectIdArg = readFlag('--project-id');

function projectUrls(doc: IProject): { manageUrl: string; archiveUrl: string } {
  const base = config.FRONTEND_URL.replace(/\/$/, '');
  const id = doc._id.toString();
  if (doc.ownerType === 'tenant' && doc.tenantId) {
    return {
      manageUrl: `${base}/console/dashboard/projects/${id}?edit=1`,
      archiveUrl: `${base}/console/dashboard/projects/${id}?action=archive`,
    };
  }
  return {
    manageUrl: `${base}/console/projects/${id}?edit=1`,
    archiveUrl: `${base}/console/projects/${id}?action=archive`,
  };
}

async function resolveProject(): Promise<IProject | null> {
  if (projectIdArg) {
    if (!mongoose.Types.ObjectId.isValid(projectIdArg)) {
      throw new Error(`Invalid --project-id: ${projectIdArg}`);
    }
    return ProjectModel.findById(projectIdArg);
  }
  return ProjectModel.findOne({ status: 'active', ownerType: 'org' }).sort({ updatedAt: -1 });
}

function buildSampleFromProject(doc: IProject) {
  const endDate =
    doc.endDate ??
    (() => {
      const d = new Date();
      d.setUTCDate(d.getUTCDate() + 1);
      return d;
    })();
  const { manageUrl, archiveUrl } = projectUrls(doc);
  const base = config.FRONTEND_URL.replace(/\/$/, '');

  return {
    projectName: doc.name,
    clientName: doc.clientName,
    endDateLabel: formatProjectDateLabel(endDate),
    daysRemaining: 1,
    manageUrl,
    archiveUrl,
    brand: {
      name: config.EMAIL_FROM_NAME || 'Racko Cloud',
      primaryColor: '#B91C1C',
      logoUrl: 'cid:racko-logo',
      showNameWithLogo: true,
      websiteUrl: base,
      websiteLabel: (() => {
        try {
          return new URL(base).host;
        } catch {
          return base;
        }
      })(),
    },
  };
}

function buildFallbackSample() {
  const base = config.FRONTEND_URL.replace(/\/$/, '');
  console.warn(
    'No project found in database. Preview uses placeholder links — pass --project-id for working URLs.'
  );
  return {
    projectName: 'ACME-2026-0042',
    clientName: 'Acme Corp',
    endDateLabel: 'September 9, 2026',
    daysRemaining: 1,
    manageUrl: `${base}/console/projects?create=1`,
    archiveUrl: `${base}/console/projects`,
    brand: {
      name: config.EMAIL_FROM_NAME || 'Racko Cloud',
      primaryColor: '#B91C1C',
      logoUrl: 'cid:racko-logo',
      showNameWithLogo: true,
      websiteUrl: base,
      websiteLabel: (() => {
        try {
          return new URL(base).host;
        } catch {
          return base;
        }
      })(),
    },
  };
}

async function main() {
  const needsDb = sendTargets.length > 0 || Boolean(projectIdArg);
  let sampleInput;

  if (needsDb) {
    await connectDatabase();
    try {
      const doc = await resolveProject();
      if (!doc) {
        throw new Error(
          'No active org project found. Create a project first or pass --project-id <mongoId>.'
        );
      }
      sampleInput = buildSampleFromProject(doc);
      console.log(`Using project: ${doc.name} (${doc._id.toString()})`);
      console.log(`Extend URL: ${sampleInput.manageUrl}`);
    } finally {
      await disconnectDatabase();
    }
  } else {
    sampleInput = buildFallbackSample();
  }

  const template = buildProjectExpiryWarningTemplate(sampleInput);

  const outDir = path.join(__dirname, '../../tmp');
  const outPath = path.join(outDir, 'project-expiry-email-preview.html');
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(outPath, template.html, 'utf8');

  console.log('Subject:', template.subject);
  console.log('Preview written to:', outPath);

  if (sendTargets.length === 0) return;

  const { sendProjectExpiryWarningEmail } = await import('../utils/email/sender');
  for (const to of sendTargets) {
    await sendProjectExpiryWarningEmail({ to, ...sampleInput });
    console.log(`Test email sent to ${to}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
