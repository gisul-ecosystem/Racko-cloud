import * as XLSX from 'xlsx';
import mongoose from 'mongoose';
import { VmHostLeaseModel, type IVmHostLease } from './vmHostLease.model';
import type {
  CreateVmHostLeaseInput,
  ListVmHostLeasesQuery,
  UpdateVmHostLeaseInput,
} from './vmHostLease.validation';
import { NotFoundError, ValidationError } from '../../utils/errors';

export interface ParsedVmHostLeaseRow {
  provider: string;
  ipAddress: string;
  description: string;
  invoiceDate: Date;
  dueDate: Date;
  assignedTo: string;
  clientAssignmentStartDate: Date | null;
  clientAssignmentEndDate: Date | null;
  vmUsername: string;
  vmPassword: string;
  rowNumber: number;
}

export interface UploadParseResult {
  rows: ParsedVmHostLeaseRow[];
  errors: Array<{ rowNumber: number; message: string }>;
}

const HEADER_ALIASES: Record<keyof Omit<ParsedVmHostLeaseRow, 'rowNumber'>, string[]> = {
  provider: ['provider', 'vendor', 'supplier', 'provider name'],
  ipAddress: ['ip address', 'ipaddress', 'ip', 'host', 'hostname', 'server ip', 'serverip'],
  description: ['description', 'desc', 'notes', 'remarks'],
  invoiceDate: ['invoice date', 'invoicedate', 'invoice', 'bill date', 'billdate'],
  dueDate: ['due date', 'duedate', 'due', 'expiry', 'expiry date', 'end date', 'enddate'],
  assignedTo: ['assigned to', 'assignedto', 'assigned', 'owner', 'person', 'contact', 'assigned to'],
  clientAssignmentStartDate: ['client assignment start date', 'client assignment start', 'assignment start date', 'assignment start', 'client start date', 'client start', 'start date'],
  clientAssignmentEndDate: ['client assignment end date', 'client assignment end', 'assignment end date', 'assignment end', 'client end date', 'client end', 'end date'],
  vmUsername: ['vm username', 'vm user', 'vmusername', 'vm login'],
  vmPassword: ['vm password', 'vm pass', 'vmpassword', 'password', 'pass', 'passwd'],
};

function normalizeHeader(value: unknown): string {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ');
}

function resolveColumnMap(headers: unknown[]): Partial<Record<keyof typeof HEADER_ALIASES, number>> {
  const map: Partial<Record<keyof typeof HEADER_ALIASES, number>> = {};

  headers.forEach((header, index) => {
    const normalized = normalizeHeader(header);
    if (!normalized) return;

    (Object.keys(HEADER_ALIASES) as Array<keyof typeof HEADER_ALIASES>).forEach((field) => {
      if (map[field] !== undefined) return;
      if (HEADER_ALIASES[field].includes(normalized)) {
        map[field] = index;
      }
    });
  });

  return map;
}

function parseExcelDate(value: unknown): Date | null {
  if (value == null || value === '') return null;

  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value;
  }

  if (typeof value === 'number' && Number.isFinite(value)) {
    const parsed = XLSX.SSF.parse_date_code(value);
    if (!parsed) return null;
    return new Date(Date.UTC(parsed.y, parsed.m - 1, parsed.d));
  }

  const asString = String(value).trim();
  if (!asString) return null;

  // Prefer ISO / unambiguous formats; fallback to Date.parse
  const isoMatch = asString.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (isoMatch) {
    const y = Number(isoMatch[1]);
    const m = Number(isoMatch[2]);
    const d = Number(isoMatch[3]);
    return new Date(Date.UTC(y, m - 1, d));
  }

  const dmyMatch = asString.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})$/);
  if (dmyMatch) {
    const a = Number(dmyMatch[1]);
    const b = Number(dmyMatch[2]);
    let y = Number(dmyMatch[3]);
    if (y < 100) y += 2000;
    // Assume DD/MM/YYYY when day > 12, otherwise treat as DD/MM/YYYY (common ops sheets)
    const day = a;
    const month = b;
    return new Date(Date.UTC(y, month - 1, day));
  }

  const parsed = new Date(asString);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed;
}

function cellString(value: unknown): string {
  if (value == null) return '';
  return String(value).trim();
}

export function parseVmHostLeaseWorkbook(buffer: Buffer): UploadParseResult {
  const workbook = XLSX.read(buffer, { type: 'buffer', cellDates: true });
  const firstSheetName = workbook.SheetNames[0];
  if (!firstSheetName) {
    throw new ValidationError('Excel file has no sheets.');
  }

  const sheet = workbook.Sheets[firstSheetName];
  if (!sheet) {
    throw new ValidationError('Excel sheet could not be read.');
  }

  const matrix = XLSX.utils.sheet_to_json<(string | number | Date | null)[]>(sheet, {
    header: 1,
    defval: '',
    raw: true,
  });

  if (matrix.length < 2) {
    throw new ValidationError('Excel sheet must include a header row and at least one data row.');
  }

  const headerRow = matrix[0] ?? [];
  const columnMap = resolveColumnMap(headerRow);
  
  // Check required columns only
  const requiredFields: Array<keyof typeof HEADER_ALIASES> = [
    'provider',
    'ipAddress',
    'description',
    'invoiceDate',
    'dueDate',
    'vmPassword',
  ];
  
  const missing = requiredFields.filter((key) => columnMap[key] === undefined);

  if (missing.length > 0) {
    throw new ValidationError(
      `Missing required column(s): ${missing.join(', ')}. Expected headers like: Provider, IP Address, Description, Invoice Date, Due Date, VM Password. (Assigned To, Client Assignment Start Date, Client Assignment End Date, and VM Username are optional)`
    );
  }

  const rows: ParsedVmHostLeaseRow[] = [];
  const errors: Array<{ rowNumber: number; message: string }> = [];

  for (let i = 1; i < matrix.length; i++) {
    const row = matrix[i] ?? [];
    const rowNumber = i + 1;

    const provider = cellString(row[columnMap.provider!]);
    const ipAddress = cellString(row[columnMap.ipAddress!]);
    const description = cellString(row[columnMap.description!]);
    const invoiceDate = parseExcelDate(row[columnMap.invoiceDate!]);
    const dueDate = parseExcelDate(row[columnMap.dueDate!]);
    const assignedTo = cellString(row[columnMap.assignedTo!]);
    const clientAssignmentStartDate = parseExcelDate(row[columnMap.clientAssignmentStartDate!]);
    const clientAssignmentEndDate = parseExcelDate(row[columnMap.clientAssignmentEndDate!]);
    const vmUsername = cellString(row[columnMap.vmUsername!]);
    const vmPassword = cellString(row[columnMap.vmPassword!]);

    const isBlank = !provider && !ipAddress && !description && !invoiceDate && !dueDate && !vmUsername && !vmPassword;
    if (isBlank) continue;

    // Require only IP Address and Due Date (most critical fields)
    if (!ipAddress || !dueDate) {
      errors.push({
        rowNumber,
        message: 'Row is incomplete. Required: IP Address, Due Date. (Other fields are optional)',
      });
      continue;
    }

    if (dueDate.getTime() < (invoiceDate?.getTime() || dueDate.getTime())) {
      errors.push({ rowNumber, message: 'Due Date must be on or after Invoice Date.' });
      continue;
    }

    if (clientAssignmentStartDate && clientAssignmentEndDate && 
        clientAssignmentEndDate.getTime() < clientAssignmentStartDate.getTime()) {
      errors.push({ rowNumber, message: 'Assignment End Date must be on or after Assignment Start Date.' });
      continue;
    }

    rows.push({ 
      provider: provider || 'N/A', 
      ipAddress, 
      description: description || 'N/A', 
      invoiceDate: invoiceDate || new Date(), 
      dueDate, 
      assignedTo: assignedTo || 'N/A',
      clientAssignmentStartDate: clientAssignmentStartDate || null,
      clientAssignmentEndDate: clientAssignmentEndDate || null,
      vmUsername: vmUsername || 'N/A', 
      vmPassword: vmPassword || 'N/A', 
      rowNumber 
    });
  }

  return { rows, errors };
}

function serializeLease(lease: IVmHostLease) {
  return {
    id: lease._id.toString(),
    provider: lease.provider || 'N/A',
    ipAddress: lease.ipAddress || (lease as any).vmIp || 'N/A',
    description: lease.description || 'N/A',
    invoiceDate: (lease.invoiceDate || (lease as any).startDate || new Date()).toISOString(),
    dueDate: (lease.dueDate || (lease as any).endDate || new Date()).toISOString(),
    assignedTo: lease.assignedTo || 'N/A',
    clientAssignmentStartDate: lease.clientAssignmentStartDate?.toISOString() || null,
    clientAssignmentEndDate: lease.clientAssignmentEndDate?.toISOString() || null,
    vmUsername: lease.vmUsername || (lease as any).username || 'N/A',
    vmPassword: lease.vmPassword || (lease as any).password || 'N/A',
    uploadedBy: lease.uploadedBy.toString(),
    sourceFileName: lease.sourceFileName,
    createdAt: lease.createdAt.toISOString(),
    updatedAt: lease.updatedAt.toISOString(),
  };
}

export class VmHostLeaseService {
  async list(query: ListVmHostLeasesQuery) {
    const filter: Record<string, unknown> = { deleted: false };

    if (query.search) {
      const q = query.search.trim();
      
      // Check if search is an IP address (contains dots)
      if (q.includes('.')) {
        // Exact match for IP address for better performance
        filter.ipAddress = q;
      } else {
        // Use text search for provider, assignedTo, description, and ipAddress
        filter.$text = { $search: q };
      }
    }

    const skip = (query.page - 1) * query.limit;
    const [items, total] = await Promise.all([
      VmHostLeaseModel.find(filter)
        .sort(query.search && !query.search.includes('.') ? { score: { $meta: 'textScore' } } : { dueDate: 1, createdAt: -1 })
        .skip(skip)
        .limit(query.limit),
      VmHostLeaseModel.countDocuments(filter),
    ]);

    return {
      leases: items.map((item) => serializeLease(item as unknown as IVmHostLease)),
      total,
      page: query.page,
      limit: query.limit,
    };
  }

  async getById(id: mongoose.Types.ObjectId) {
    const lease = await VmHostLeaseModel.findOne({ _id: id, deleted: false });
    if (!lease) throw new NotFoundError('VM host lease not found.');
    return serializeLease(lease);
  }

  async create(input: CreateVmHostLeaseInput, uploadedBy: mongoose.Types.ObjectId) {
    const lease = await VmHostLeaseModel.create({
      ...input,
      uploadedBy,
      sourceFileName: null,
    });
    return serializeLease(lease);
  }

  async update(id: mongoose.Types.ObjectId, input: UpdateVmHostLeaseInput) {
    const lease = await VmHostLeaseModel.findOne({ _id: id, deleted: false });
    if (!lease) throw new NotFoundError('VM host lease not found.');

    if (input.provider !== undefined) lease.provider = input.provider;
    if (input.ipAddress !== undefined) lease.ipAddress = input.ipAddress;
    if (input.description !== undefined) lease.description = input.description;
    if (input.invoiceDate !== undefined) lease.invoiceDate = input.invoiceDate;
    if (input.dueDate !== undefined) lease.dueDate = input.dueDate;
    if (input.assignedTo !== undefined) lease.assignedTo = input.assignedTo;
    if (input.clientAssignmentStartDate !== undefined) lease.clientAssignmentStartDate = input.clientAssignmentStartDate;
    if (input.clientAssignmentEndDate !== undefined) lease.clientAssignmentEndDate = input.clientAssignmentEndDate;
    if (input.vmUsername !== undefined) lease.vmUsername = input.vmUsername;
    if (input.vmPassword !== undefined) lease.vmPassword = input.vmPassword;

    const invoiceDate = lease.invoiceDate;
    const dueDate = lease.dueDate;
    if (dueDate.getTime() < invoiceDate.getTime()) {
      throw new ValidationError('Due Date must be on or after Invoice Date.');
    }

    if (lease.clientAssignmentStartDate && lease.clientAssignmentEndDate &&
        lease.clientAssignmentEndDate.getTime() < lease.clientAssignmentStartDate.getTime()) {
      throw new ValidationError('Assignment End Date must be on or after Assignment Start Date.');
    }

    // If due date changed, allow a new reminder for the new due date.
    if (input.dueDate !== undefined) {
      lease.expiryWarningFor = null;
    }

    await lease.save();
    return serializeLease(lease);
  }

  async remove(id: mongoose.Types.ObjectId) {
    const lease = await VmHostLeaseModel.findOne({ _id: id, deleted: false });
    if (!lease) throw new NotFoundError('VM host lease not found.');
    lease.deleted = true;
    await lease.save();
  }

  async uploadFromExcel(
    buffer: Buffer,
    uploadedBy: mongoose.Types.ObjectId,
    sourceFileName: string
  ) {
    const { rows, errors } = parseVmHostLeaseWorkbook(buffer);

    if (rows.length === 0) {
      throw new ValidationError(
        errors.length > 0
          ? `No valid rows to import. ${errors.length} row(s) had errors.`
          : 'No data rows found in the Excel sheet.'
      );
    }

    // Use bulkWrite for upsert operations
    const ops = rows.map((row) => ({
      updateOne: {
        filter: { ipAddress: row.ipAddress, deleted: false },
        update: {
          $set: {
            provider: row.provider,
            ipAddress: row.ipAddress,
            description: row.description,
            invoiceDate: row.invoiceDate,
            dueDate: row.dueDate,
            assignedTo: row.assignedTo,
            clientAssignmentStartDate: row.clientAssignmentStartDate,
            clientAssignmentEndDate: row.clientAssignmentEndDate,
            vmUsername: row.vmUsername,
            vmPassword: row.vmPassword,
            sourceFileName,
            uploadedBy,
          },
          $setOnInsert: {
            deleted: false,
            expiryWarningFor: null,
            createdAt: new Date(),
          },
        },
        upsert: true,
      },
    }));

    const result = await VmHostLeaseModel.bulkWrite(ops);

    // Count updated vs inserted
    const inserted = result.upsertedCount || 0;
    const updated = result.modifiedCount || 0;
    const total = inserted + updated;

    return {
      imported: total,
      skippedErrors: errors,
      leases: [], // Will be fetched by client after upload completes
      stats: {
        inserted,
        updated,
        total,
      },
    };
  }
}

export const vmHostLeaseService = new VmHostLeaseService();
