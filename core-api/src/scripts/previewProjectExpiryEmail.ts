/**
 * Render project expiry emails to HTML files (and optionally send tests).
 *
 * Usage:
 *   npm run preview:project-expiry-email
 *   npm run preview:project-expiry-email -- --project-id <mongoId>
 *   npm run preview:project-expiry-email -- --send you@example.com
 *   npm run preview:project-expiry-email -- --send a@x.com --variant client --project-id <mongoId>
 *
 * When sending, loads a real project from MongoDB so email links and resource lists work.
 * Without --project-id, uses the first active org project found.
 */
import fs from 'fs';
import path from 'path';
import mongoose from 'mongoose';
import { config } from '../config';
import { connectDatabase, disconnectDatabase } from '../config/database';
import { ProjectModel, type IProject } from '../models/project.model';
import { buildProjectExpiryWarningTemplate } from '../utils/email/templates/projectExpiryWarning';
import { buildProjectExpiryClientWarningTemplate } from '../utils/email/templates/projectExpiryClientWarning';
import { formatProjectDateLabel } from '../modules/projects/projectExpiryDates';
import {
  summarizeProjectExpiryForAgent,
  summarizeProjectExpiryForClient,
} from '../modules/projects/projectExpiryResources';
import { buildProjectExpiryAgentAttachment } from '../modules/projects/projectExpiryAgentWorkbook';
import { buildProjectExpiryClientAttachment } from '../modules/projects/projectExpiryClientWorkbook';

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
const variantArg = readFlag('--variant') ?? 'both';

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

function buildBrand() {
  const base = config.FRONTEND_URL.replace(/\/$/, '');
  return {
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
  };
}

async function buildAgentSample(doc: IProject) {
  const endDate =
    doc.endDate ??
    (() => {
      const d = new Date();
      d.setUTCDate(d.getUTCDate() + 1);
      return d;
    })();
  const { manageUrl, archiveUrl } = projectUrls(doc);
  return {
    projectName: doc.name,
    clientName: doc.clientName,
    endDateLabel: formatProjectDateLabel(endDate),
    daysRemaining: 1,
    graceHours: config.PROJECT_GRACE_PERIOD_HOURS,
    manageUrl,
    archiveUrl,
    brand: buildBrand(),
  };
}

async function buildClientSample(doc: IProject) {
  const endDate =
    doc.endDate ??
    (() => {
      const d = new Date();
      d.setUTCDate(d.getUTCDate() + 1);
      return d;
    })();
  const clientSummary = await summarizeProjectExpiryForClient(doc);
  return {
    projectName: doc.name,
    clientName: doc.clientName,
    endDateLabel: formatProjectDateLabel(endDate),
    daysRemaining: 1,
    graceHours: config.PROJECT_GRACE_PERIOD_HOURS,
    clientSummary,
    brand: buildBrand(),
  };
}

async function buildAgentSampleWithResources(doc: IProject) {
  const base = await buildAgentSample(doc);
  const agentSummary = await summarizeProjectExpiryForAgent(doc);
  return { ...base, agentSummary };
}

async function main() {
  const needsDb =
    sendTargets.length > 0 ||
    Boolean(projectIdArg) ||
    variantArg === 'client' ||
    variantArg === 'both';
  const outDir = path.join(__dirname, '../../tmp');
  fs.mkdirSync(outDir, { recursive: true });

  let doc: IProject | null = null;
  if (needsDb) {
    await connectDatabase();
    try {
      doc = await resolveProject();
      if (!doc) {
        throw new Error(
          'No active org project found. Create a project first or pass --project-id <mongoId>.'
        );
      }
      console.log(`Using project: ${doc.name} (${doc._id.toString()})`);
    } catch (err) {
      await disconnectDatabase();
      throw err;
    }
  }

  if (variantArg === 'both' || variantArg === 'agent') {
    const agentInput = doc
      ? await buildAgentSampleWithResources(doc)
      : {
          projectName: 'ACME-2026-0042',
          clientName: 'Acme Corp',
          endDateLabel: 'September 9, 2026',
          daysRemaining: 1,
          graceHours: config.PROJECT_GRACE_PERIOD_HOURS,
          manageUrl: `${config.FRONTEND_URL.replace(/\/$/, '')}/console/projects?create=1`,
          archiveUrl: `${config.FRONTEND_URL.replace(/\/$/, '')}/console/projects`,
          brand: buildBrand(),
          agentSummary: { services: [], resources: [] },
        };
    const agentAttachment = agentInput.agentSummary
      ? buildProjectExpiryAgentAttachment(
          agentInput.clientName,
          agentInput.agentSummary.resources
        )
      : null;
    const agentTemplate = buildProjectExpiryWarningTemplate({
      ...agentInput,
      attachmentFilename: agentAttachment?.filename,
    });
    const agentPath = path.join(outDir, 'project-expiry-agent-email-preview.html');
    fs.writeFileSync(agentPath, agentTemplate.html, 'utf8');
    console.log('Support agent subject:', agentTemplate.subject);
    console.log('Support agent preview:', agentPath);
    if (doc) console.log(`Extend URL: ${agentInput.manageUrl}`);
    if (agentAttachment) {
      const xlsxPath = path.join(outDir, agentAttachment.filename);
      fs.writeFileSync(xlsxPath, Buffer.from(agentAttachment.content, 'base64'));
      console.log('Support Excel preview:', xlsxPath);
      console.log(`Resource rows: ${agentInput.agentSummary?.resources.length ?? 0}`);
    }
  }

  if (variantArg === 'both' || variantArg === 'client') {
    if (!doc && needsDb) {
      throw new Error('Client preview requires a project from the database.');
    }
    const clientInput = doc
      ? await buildClientSample(doc)
      : null;
    if (!clientInput) {
      console.warn('Skipping client preview — no project in database.');
    } else {
      const attachment = buildProjectExpiryClientAttachment(
        clientInput.clientName,
        clientInput.clientSummary.accessRows
      );
      const clientTemplate = buildProjectExpiryClientWarningTemplate({
        ...clientInput,
        attachmentFilename: attachment?.filename,
      });
      const clientPath = path.join(outDir, 'project-expiry-client-email-preview.html');
      fs.writeFileSync(clientPath, clientTemplate.html, 'utf8');
      console.log('Client subject:', clientTemplate.subject);
      console.log('Client preview:', clientPath);
      if (attachment) {
        const xlsxPath = path.join(outDir, attachment.filename);
        fs.writeFileSync(xlsxPath, Buffer.from(attachment.content, 'base64'));
        console.log('Client Excel preview:', xlsxPath);
        console.log(`Login rows: ${clientInput.clientSummary.accessRows.length}`);
      }
    }
  }

  if (sendTargets.length > 0) {
    if (!doc) {
      throw new Error('Send requires a real project. Pass --project-id <mongoId>.');
    }

    const {
      sendProjectExpiryWarningEmail,
      sendProjectExpiryClientWarningEmail,
    } = await import('../utils/email/sender');

    for (const to of sendTargets) {
      if (variantArg === 'client' || variantArg === 'both') {
        const clientInput = await buildClientSample(doc);
        await sendProjectExpiryClientWarningEmail({ to, ...clientInput });
        console.log(`Client test email sent to ${to}`);
      }
      if (variantArg === 'agent' || variantArg === 'both') {
        const agentInput = await buildAgentSampleWithResources(doc);
        await sendProjectExpiryWarningEmail({ to, ...agentInput });
        console.log(`Support agent test email sent to ${to}`);
      }
    }
  }

  if (needsDb) {
    await disconnectDatabase();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
