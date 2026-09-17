import * as XLSX from 'xlsx';
import type { EmailAttachment } from '../../utils/email/sender';
import type { ProjectExpiryClientAccessRow } from './projectExpiryResources';

const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

function slugifyFilename(value: string): string {
  const slug = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
  return slug || 'project';
}

interface ClientLoginSheetRow {
  Service: string;
  Username: string;
  Password: string;
}

export function buildProjectExpiryClientAttachment(
  clientName: string,
  accessRows: ProjectExpiryClientAccessRow[]
): EmailAttachment | null {
  if (accessRows.length === 0) return null;

  const sheetRows: ClientLoginSheetRow[] = accessRows.map((row) => ({
    Service: row.serviceLabel,
    Username: row.username,
    Password: row.password,
  }));

  const sheet = XLSX.utils.json_to_sheet(sheetRows, {
    header: ['Service', 'Username', 'Password'],
  });
  sheet['!cols'] = [{ wch: 28 }, { wch: 24 }, { wch: 24 }];

  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, sheet, 'Project logins');
  const buffer = XLSX.write(book, { type: 'buffer', bookType: 'xlsx' }) as Buffer;

  return {
    filename: `${slugifyFilename(clientName)}-Login-Details.xlsx`,
    content: buffer.toString('base64'),
    mimeType: XLSX_MIME,
  };
}
