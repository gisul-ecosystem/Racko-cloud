'use client';

import { useCallback, useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, Download, FileSpreadsheet, Loader2, X } from 'lucide-react';
import { ApiError } from '@/lib/apiClient';
import {
  importInventoryRows,
  type ImportResult,
  type ImportRowPayload,
} from '@/lib/vmInventoryApi';

/**
 * Locked template. Headers are matched exactly (after case/spacing
 * normalization) rather than against alias lists, so a mislabelled sheet fails
 * loudly instead of silently dropping a column.
 */
const TEMPLATE_COLUMNS = [
  { header: 'IP', key: 'ipAddress', required: true },
  { header: 'Plan Duration', key: 'planDuration', required: false },
  { header: 'VM Spec', key: 'vmSpec', required: false },
  { header: 'Username', key: 'username', required: false },
  { header: 'Password', key: 'password', required: false },
  { header: 'Provider-Start Date', key: 'providerStartDate', required: false },
  { header: 'Provider-End Date', key: 'providerEndDate', required: false },
  { header: 'VM Type', key: 'vmType', required: false },
  { header: 'Provider', key: 'provider', required: false },
] as const;

const normalizeHeader = (value: string): string =>
  value.trim().toLowerCase().replace(/[^a-z0-9]/g, '');

const HEADER_LOOKUP = new Map(
  TEMPLATE_COLUMNS.map((c) => [normalizeHeader(c.header), c.key as string])
);

const ACTION_LABELS: Record<ImportResult['results'][number]['action'], string> = {
  created: 'New server',
  updated: 'Metadata updated',
  credential_added: 'Login added',
  skipped: 'No change',
  failed: 'Rejected',
};

const ACTION_STYLES: Record<ImportResult['results'][number]['action'], string> = {
  created: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  updated: 'bg-blue-50 text-blue-700 ring-blue-200',
  credential_added: 'bg-indigo-50 text-indigo-700 ring-indigo-200',
  skipped: 'bg-gray-50 text-gray-600 ring-gray-200',
  failed: 'bg-rose-50 text-rose-700 ring-rose-200',
};

/** Accepts a real Date cell or a strict YYYY-MM-DD string. Nothing else. */
function parseTemplateDate(value: unknown): { date: string | null; error?: string } {
  if (value === null || value === undefined || value === '') return { date: null };
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return { date: value.toISOString() };
  }
  const raw = String(value).trim();
  if (!raw) return { date: null };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    return { date: null, error: `"${raw}" must be formatted YYYY-MM-DD` };
  }
  const parsed = new Date(`${raw}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime())) {
    return { date: null, error: `"${raw}" is not a real date` };
  }
  return { date: parsed.toISOString() };
}

interface ParseOutcome {
  rows: ImportRowPayload[];
  headerErrors: string[];
  rowErrors: string[];
}

interface VmInventoryImportModalProps {
  onClose: () => void;
  onImported: () => void;
}

export function VmInventoryImportModal({ onClose, onImported }: VmInventoryImportModalProps) {
  const [fileName, setFileName] = useState<string | null>(null);
  const [parsing, setParsing] = useState(false);
  const [parsed, setParsed] = useState<ParseOutcome | null>(null);
  const [preview, setPreview] = useState<ImportResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const downloadTemplate = useCallback(async () => {
    const XLSX = await import('xlsx');
    const sheet = XLSX.utils.aoa_to_sheet([
      TEMPLATE_COLUMNS.map((c) => c.header),
      [
        '10.0.0.10',
        'Hourly',
        'Memory (8GB), Core (4), Disk (250GB)',
        'Administrator',
        'secret',
        '2026-01-01',
        '2026-12-31',
        'rdp',
        'Contabo',
      ],
    ]);
    const book = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(book, sheet, 'Servers');
    XLSX.writeFile(book, 'vm-inventory-template.xlsx');
  }, []);

  const handleFile = useCallback(async (file: File) => {
    setParsing(true);
    setError(null);
    setPreview(null);
    setParsed(null);
    setFileName(file.name);

    try {
      const XLSX = await import('xlsx');
      const buffer = await file.arrayBuffer();
      const book = XLSX.read(buffer, { cellDates: true });
      const sheetName = book.SheetNames[0];
      if (!sheetName) throw new Error('The workbook has no sheets.');

      const grid = XLSX.utils.sheet_to_json<unknown[]>(book.Sheets[sheetName]!, {
        header: 1,
        blankrows: false,
      });
      if (grid.length < 2) throw new Error('The sheet has no data rows.');

      const headerRow = (grid[0] ?? []).map((c) => String(c ?? ''));
      const headerErrors: string[] = [];
      const columnIndex = new Map<string, number>();

      headerRow.forEach((header, index) => {
        const key = HEADER_LOOKUP.get(normalizeHeader(header));
        if (key) columnIndex.set(key, index);
        else if (header.trim()) headerErrors.push(`Unrecognized column "${header}"`);
      });

      for (const column of TEMPLATE_COLUMNS) {
        if (column.required && !columnIndex.has(column.key)) {
          headerErrors.push(`Missing required column "${column.header}"`);
        }
      }

      const rows: ImportRowPayload[] = [];
      const rowErrors: string[] = [];

      if (headerErrors.length === 0) {
        for (let i = 1; i < grid.length; i += 1) {
          const line = grid[i] ?? [];
          const cell = (key: string): unknown => {
            const idx = columnIndex.get(key);
            return idx === undefined ? undefined : line[idx];
          };

          const ipAddress = String(cell('ipAddress') ?? '').trim();
          if (!ipAddress) continue;

          const start = parseTemplateDate(cell('providerStartDate'));
          const end = parseTemplateDate(cell('providerEndDate'));
          if (start.error) rowErrors.push(`Row ${i + 1}: provider start date ${start.error}`);
          if (end.error) rowErrors.push(`Row ${i + 1}: provider end date ${end.error}`);

          const str = (key: string): string | null => {
            const raw = cell(key);
            const text = raw === null || raw === undefined ? '' : String(raw).trim();
            return text || null;
          };

          // Only send keys for columns the sheet actually has. An omitted key
          // tells the server to leave that stored value alone, whereas an
          // explicit null clears it.
          const optional = (key: string): Record<string, string | null> =>
            columnIndex.has(key) ? { [key]: str(key) } : {};

          rows.push({
            ipAddress,
            ...optional('vmType'),
            ...optional('vmSpec'),
            ...optional('planDuration'),
            ...optional('provider'),
            ...optional('username'),
            ...optional('password'),
            ...(columnIndex.has('providerStartDate') ? { providerStartDate: start.date } : {}),
            ...(columnIndex.has('providerEndDate') ? { providerEndDate: end.date } : {}),
          });
        }

        if (rows.length === 0) rowErrors.push('No rows contained an IP address.');
      }

      setParsed({ rows, headerErrors, rowErrors });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not read that file.');
    } finally {
      setParsing(false);
    }
  }, []);

  const canSubmit = useMemo(
    () =>
      Boolean(parsed) &&
      parsed!.headerErrors.length === 0 &&
      parsed!.rowErrors.length === 0 &&
      parsed!.rows.length > 0,
    [parsed]
  );

  const runPreview = useCallback(async () => {
    if (!parsed || !canSubmit) return;
    setBusy(true);
    setError(null);
    try {
      setPreview(await importInventoryRows(parsed.rows, true));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Preview failed.');
    } finally {
      setBusy(false);
    }
  }, [parsed, canSubmit]);

  const commit = useCallback(async () => {
    if (!parsed || !canSubmit) return;
    setBusy(true);
    setError(null);
    try {
      const result = await importInventoryRows(parsed.rows, false);
      setPreview(result);
      onImported();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Import failed.');
    } finally {
      setBusy(false);
    }
  }, [parsed, canSubmit, onImported]);

  const blockers = parsed ? [...parsed.headerErrors, ...parsed.rowErrors] : [];

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4 sm:p-8">
      <div className="w-full max-w-4xl rounded-2xl bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-gray-100 px-6 py-4">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Import servers</h2>
            <p className="mt-0.5 text-sm text-gray-500">
              Provider dates and logins come from the template sheet.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-gray-400 transition hover:bg-gray-100 hover:text-gray-600"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-5 px-6 py-5">
          <div className="flex flex-wrap items-center gap-3">
            <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg bg-[#B91C1C] px-4 py-2 text-sm font-medium text-white transition hover:bg-[#991B1B]">
              <FileSpreadsheet className="h-4 w-4" />
              Choose file
              <input
                type="file"
                accept=".xlsx,.xls,.csv"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) void handleFile(file);
                  e.target.value = '';
                }}
              />
            </label>
            <button
              type="button"
              onClick={() => void downloadTemplate()}
              className="inline-flex items-center gap-2 rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-700 transition hover:bg-gray-50"
            >
              <Download className="h-4 w-4" />
              Download template
            </button>
            {fileName && <span className="text-sm text-gray-500">{fileName}</span>}
            {parsing && <Loader2 className="h-4 w-4 animate-spin text-gray-400" />}
          </div>

          <div className="rounded-lg bg-gray-50 px-4 py-3 text-xs text-gray-600">
            <span className="font-medium text-gray-700">Expected columns:</span>{' '}
            {TEMPLATE_COLUMNS.map((c) => c.header).join(' · ')}. Only <span className="font-medium">IP</span>{' '}
            is mandatory. Dates may be real Excel dates or YYYY-MM-DD text. A new IP needs a
            username and password; existing IPs update in place. If{' '}
            <span className="font-medium">VM Type</span> is omitted it is inferred from the
            username.
          </div>

          {error && (
            <div className="flex items-start gap-2 rounded-lg bg-rose-50 px-4 py-3 text-sm text-rose-700 ring-1 ring-rose-200">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {blockers.length > 0 && (
            <div className="rounded-lg bg-rose-50 px-4 py-3 ring-1 ring-rose-200">
              <p className="flex items-center gap-2 text-sm font-medium text-rose-800">
                <AlertTriangle className="h-4 w-4" />
                Fix {blockers.length} problem{blockers.length === 1 ? '' : 's'} before importing
              </p>
              <ul className="mt-2 max-h-40 space-y-1 overflow-y-auto text-xs text-rose-700">
                {blockers.slice(0, 25).map((message) => (
                  <li key={message}>• {message}</li>
                ))}
                {blockers.length > 25 && <li>• …and {blockers.length - 25} more</li>}
              </ul>
            </div>
          )}

          {parsed && blockers.length === 0 && (
            <p className="text-sm text-gray-600">
              Parsed <span className="font-semibold text-gray-900">{parsed.rows.length}</span> row
              {parsed.rows.length === 1 ? '' : 's'}. Preview to see what will change.
            </p>
          )}

          {preview && (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
                {[
                  ['New', preview.summary.created],
                  ['Updated', preview.summary.updated],
                  ['Logins added', preview.summary.credentialsAdded],
                  ['No change', preview.summary.skipped],
                  ['Rejected', preview.summary.failed],
                ].map(([label, count]) => (
                  <div key={label} className="rounded-lg bg-gray-50 px-3 py-2 text-center">
                    <p className="text-lg font-semibold text-gray-900">{count}</p>
                    <p className="text-[11px] uppercase tracking-wide text-gray-500">{label}</p>
                  </div>
                ))}
              </div>

              <div className="max-h-64 overflow-y-auto rounded-lg border border-gray-100">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500">
                    <tr>
                      <th className="px-3 py-2">Row</th>
                      <th className="px-3 py-2">IP</th>
                      <th className="px-3 py-2">Result</th>
                      <th className="px-3 py-2">Detail</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {preview.results.map((row) => (
                      <tr key={`${row.index}-${row.ipAddress}`}>
                        <td className="px-3 py-2 text-gray-500">{row.index + 2}</td>
                        <td className="px-3 py-2 font-mono text-xs text-gray-900">
                          {row.ipAddress || '—'}
                        </td>
                        <td className="px-3 py-2">
                          <span
                            className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ${ACTION_STYLES[row.action]}`}
                          >
                            {ACTION_LABELS[row.action]}
                          </span>
                        </td>
                        <td className="px-3 py-2 text-xs text-gray-600">
                          {row.error ? (
                            <span className="text-rose-600">{row.error}</span>
                          ) : (
                            (row.note ?? '—')
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-3 border-t border-gray-100 px-6 py-4">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg px-4 py-2 text-sm font-medium text-gray-600 transition hover:bg-gray-100"
          >
            Close
          </button>
          <button
            type="button"
            onClick={() => void runPreview()}
            disabled={!canSubmit || busy}
            className="inline-flex items-center gap-2 rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-700 transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {busy && !preview ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Preview
          </button>
          <button
            type="button"
            onClick={() => void commit()}
            disabled={!canSubmit || busy || !preview}
            className="inline-flex items-center gap-2 rounded-lg bg-[#B91C1C] px-4 py-2 text-sm font-medium text-white transition hover:bg-[#991B1B] disabled:cursor-not-allowed disabled:opacity-50"
            title={!preview ? 'Run a preview first' : undefined}
          >
            {busy && preview ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <CheckCircle2 className="h-4 w-4" />
            )}
            Apply import
          </button>
        </div>
      </div>
    </div>
  );
}
