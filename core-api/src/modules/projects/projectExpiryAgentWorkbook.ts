import * as XLSX from 'xlsx';
import type { EmailAttachment } from '../../utils/email/sender';
import type { ProjectExpiryAgentResourceRow } from './projectExpiryResources';

const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

function slugifyFilename(value: string): string {
  const slug = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
  return slug || 'project';
}

interface AgentResourceSheetRow {
  Service: string;
  Resource: string;
  IP: string;
  Protocol: string;
  Username: string;
  Password: string;
  Status: string;
}

function formatProtocol(protocol?: string, port?: number): string {
  const label = protocol?.trim();
  if (!label) return '';
  return port ? `${label}:${port}` : label;
}

export function buildProjectExpiryAgentAttachment(
  clientName: string,
  resources: ProjectExpiryAgentResourceRow[]
): EmailAttachment | null {
  if (resources.length === 0) return null;

  const sheetRows: AgentResourceSheetRow[] = resources.map((row) => ({
    Service: row.serviceLabel,
    Resource: row.name,
    IP: row.ipAddress?.trim() || row.hostname?.trim() || '',
    Protocol: formatProtocol(row.protocol, row.port),
    Username: row.username?.trim() || '',
    Password: row.password?.trim() || '',
    Status: row.status?.trim() || '',
  }));

  const sheet = XLSX.utils.json_to_sheet(sheetRows, {
    header: ['Service', 'Resource', 'IP', 'Protocol', 'Username', 'Password', 'Status'],
  });
  sheet['!cols'] = [
    { wch: 22 },
    { wch: 28 },
    { wch: 18 },
    { wch: 14 },
    { wch: 20 },
    { wch: 20 },
    { wch: 14 },
  ];

  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, sheet, 'Resource inventory');
  const buffer = XLSX.write(book, { type: 'buffer', bookType: 'xlsx' }) as Buffer;

  return {
    filename: `${slugifyFilename(clientName)}-Resource-Inventory.xlsx`,
    content: buffer.toString('base64'),
    mimeType: XLSX_MIME,
  };
}
