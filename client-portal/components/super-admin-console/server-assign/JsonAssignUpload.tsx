'use client';

import { useCallback, useRef, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle,
  Download,
  FileJson,
  Loader2,
  Upload,
  XCircle,
} from 'lucide-react';
import { ApiError } from '@/lib/apiClient';
import { resolveInventoryLogins, type ResolvedLoginRow } from '@/lib/vmInventoryApi';

/** One row of the uploaded file, after key normalisation. */
interface FileRow {
  ipAddress: string;
  username: string;
  vmPassword: string | null;
  email: string;
  userPassword: string;
}

/** A file row joined with what the inventory says about it. */
export interface JsonAssignRow extends FileRow {
  index: number;
  credentialId: string | null;
  serverId: string | null;
  /** Blocks the row from being assigned. */
  error: string | null;
  /** Does not block: the file's VM password disagrees with the inventory. */
  passwordMismatch: boolean;
}

/** Exactly what the bulk assign call needs, in file order. */
export interface JsonAssignPair {
  credentialId: string;
  /** Carried so the prepare steps can act on the VM behind the login. */
  serverId: string;
  ipAddress: string;
  username: string;
  email: string;
  password: string;
}

const MAX_ROWS = 250;

const SAMPLE: FileRow[] = [
  {
    ipAddress: '157.15.203.154',
    username: 'user1',
    vmPassword: 'Vm@12345',
    email: 'labuser1@gmail.com',
    userPassword: 'Lab@12345',
  },
  {
    ipAddress: '157.15.203.154',
    username: 'user2',
    vmPassword: 'Vm@67890',
    email: 'labuser2@gmail.com',
    userPassword: 'Lab@12345',
  },
];

/** `vm_password`, `VM Password` and `vmPassword` all mean the same thing. */
function normaliseKey(key: string): string {
  return key.toLowerCase().replace(/[^a-z0-9]/g, '');
}

const FIELD_ALIASES: Record<keyof FileRow, string[]> = {
  ipAddress: ['ipaddress', 'ip', 'vmip', 'serverip'],
  username: ['username', 'user', 'vmusername', 'vmuser', 'login'],
  vmPassword: ['vmpassword', 'password', 'serverpassword', 'vmpass'],
  email: ['email', 'useremail', 'assignedemail', 'assigneduseremail', 'portalemail'],
  userPassword: [
    'userpassword',
    'assigneduserpassword',
    'assignedpassword',
    'portalpassword',
    'loginpassword',
  ],
};

function pick(row: Record<string, unknown>, field: keyof FileRow): string {
  for (const alias of FIELD_ALIASES[field]) {
    const value = row[alias];
    if (value !== undefined && value !== null && String(value).trim() !== '') {
      return String(value).trim();
    }
  }
  return '';
}

/** Mirrors the server's password policy so bad rows are caught before upload. */
function passwordPolicyError(value: string): string | null {
  if (value.length < 8) return 'User password must be at least 8 characters.';
  if (!/[A-Z]/.test(value)) return 'User password needs an uppercase letter.';
  if (!/[a-z]/.test(value)) return 'User password needs a lowercase letter.';
  if (!/[0-9]/.test(value)) return 'User password needs a number.';
  if (!/[^A-Za-z0-9]/.test(value)) return 'User password needs a special character.';
  return null;
}

function parseFile(text: string): FileRow[] {
  const parsed: unknown = JSON.parse(text);
  const list = Array.isArray(parsed)
    ? parsed
    : Array.isArray((parsed as { rows?: unknown }).rows)
      ? (parsed as { rows: unknown[] }).rows
      : null;
  if (!list) {
    throw new Error('Expected a JSON array of rows, or an object with a "rows" array.');
  }
  if (list.length === 0) throw new Error('The file has no rows.');
  if (list.length > MAX_ROWS) {
    throw new Error(`The file has ${list.length} rows. The cap is ${MAX_ROWS} per assignment.`);
  }

  return list.map((entry, i) => {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
      throw new Error(`Row ${i + 1} is not an object.`);
    }
    const normalised: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(entry as Record<string, unknown>)) {
      normalised[normaliseKey(key)] = value;
    }
    const vmPassword = pick(normalised, 'vmPassword');
    return {
      ipAddress: pick(normalised, 'ipAddress'),
      username: pick(normalised, 'username'),
      vmPassword: vmPassword || null,
      email: pick(normalised, 'email').toLowerCase(),
      userPassword: pick(normalised, 'userPassword'),
    };
  });
}

/** Everything the file alone can be judged on, before the inventory is consulted. */
function localError(row: FileRow, seenEmails: Set<string>, seenLogins: Set<string>): string | null {
  if (!row.ipAddress) return 'Missing VM IP.';
  if (!row.username) return 'Missing VM username.';
  if (!row.email) return 'Missing user email.';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(row.email)) return `"${row.email}" is not a valid email.`;
  if (!row.userPassword) return 'Missing user password.';
  const policy = passwordPolicyError(row.userPassword);
  if (policy) return policy;

  const loginKey = `${row.ipAddress}|${row.username.toLowerCase()}`;
  if (seenLogins.has(loginKey)) return 'This IP and username appear twice in the file.';
  if (seenEmails.has(row.email)) return `${row.email} appears twice in the file.`;
  seenLogins.add(loginKey);
  seenEmails.add(row.email);
  return null;
}

/**
 * Assign straight from a file that already pairs each VM login with its user,
 * for batches prepared outside the portal. Rows are matched against the
 * inventory server-side; nothing is created from the file.
 */
export function JsonAssignUpload({
  onChange,
  disabled,
}: {
  /** Valid rows only, in file order. Empty while the file is unusable. */
  onChange: (pairs: JsonAssignPair[]) => void;
  disabled?: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [rows, setRows] = useState<JsonAssignRow[]>([]);
  const [busy, setBusy] = useState(false);

  const reset = useCallback(() => {
    setFileName(null);
    setFileError(null);
    setRows([]);
    onChange([]);
    if (inputRef.current) inputRef.current.value = '';
  }, [onChange]);

  const handleFile = useCallback(
    async (file: File) => {
      setBusy(true);
      setFileError(null);
      setRows([]);
      onChange([]);
      setFileName(file.name);

      let parsed: FileRow[];
      try {
        parsed = parseFile(await file.text());
      } catch (err) {
        setFileError(err instanceof Error ? err.message : 'Could not read the file.');
        setBusy(false);
        return;
      }

      const seenEmails = new Set<string>();
      const seenLogins = new Set<string>();
      const localErrors = parsed.map((r) => localError(r, seenEmails, seenLogins));

      // Only rows naming a VM can be looked up; the rest already have a reason.
      const lookupIndexes = parsed
        .map((_, i) => i)
        .filter((i) => parsed[i]!.ipAddress && parsed[i]!.username);

      let resolvedByIndex = new Map<number, ResolvedLoginRow>();
      if (lookupIndexes.length > 0) {
        try {
          const res = await resolveInventoryLogins(
            lookupIndexes.map((i) => ({
              ipAddress: parsed[i]!.ipAddress,
              username: parsed[i]!.username,
              vmPassword: parsed[i]!.vmPassword,
            }))
          );
          resolvedByIndex = new Map(
            res.rows.map((r) => [lookupIndexes[r.index]!, r])
          );
        } catch (err) {
          setFileError(
            err instanceof ApiError ? err.message : 'Could not match the file against the inventory.'
          );
          setBusy(false);
          return;
        }
      }

      const merged: JsonAssignRow[] = parsed.map((row, i) => {
        const resolved = resolvedByIndex.get(i);
        return {
          ...row,
          index: i,
          credentialId: resolved?.credentialId ?? null,
          serverId: resolved?.serverId ?? null,
          error: localErrors[i] ?? resolved?.error ?? null,
          passwordMismatch: resolved?.vmPasswordMatches === false,
        };
      });

      setRows(merged);
      onChange(
        merged
          .filter((r): r is JsonAssignRow & { credentialId: string; serverId: string } =>
            Boolean(!r.error && r.credentialId && r.serverId)
          )
          .map((r) => ({
            credentialId: r.credentialId,
            serverId: r.serverId,
            ipAddress: r.ipAddress,
            username: r.username,
            email: r.email,
            password: r.userPassword,
          }))
      );
      setBusy(false);
    },
    [onChange]
  );

  const downloadSample = useCallback(() => {
    const blob = new Blob([JSON.stringify(SAMPLE, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'server-assign-sample.json';
    a.click();
    URL.revokeObjectURL(url);
  }, []);

  const ready = rows.filter((r) => !r.error).length;
  const blocked = rows.length - ready;
  const mismatches = rows.filter((r) => r.passwordMismatch && !r.error).length;

  return (
    <div className="mt-4">
      <div className="flex flex-wrap items-center gap-3 rounded-lg border border-dashed border-gray-200 px-4 py-4">
        <FileJson className="h-5 w-5 shrink-0 text-gray-400" />
        <div className="min-w-0 flex-1">
          <p className="text-sm text-gray-700">
            {fileName ?? 'Upload a JSON file pairing each VM login with its user.'}
          </p>
          <p className="mt-0.5 text-xs text-gray-500">
            Each row needs <code>ipAddress</code>, <code>username</code>, <code>vmPassword</code>,{' '}
            <code>email</code> and <code>userPassword</code>. Logins must already exist in the
            inventory.
          </p>
        </div>
        <input
          ref={inputRef}
          type="file"
          accept="application/json,.json"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void handleFile(file);
          }}
        />
        <button
          type="button"
          onClick={downloadSample}
          className="inline-flex items-center gap-2 rounded-lg border border-gray-200 px-3 py-1.5 text-sm text-gray-700 transition hover:bg-gray-50"
        >
          <Download className="h-4 w-4" />
          Sample
        </button>
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={disabled || busy}
          className="inline-flex items-center gap-2 rounded-lg border border-gray-200 px-3 py-1.5 text-sm text-gray-700 transition hover:bg-gray-50 disabled:opacity-40"
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
          {fileName ? 'Replace file' : 'Choose file'}
        </button>
        {fileName && !busy && (
          <button
            type="button"
            onClick={reset}
            className="text-xs font-semibold text-[#B91C1C] hover:underline"
          >
            Clear
          </button>
        )}
      </div>

      {fileError && (
        <div className="mt-3 flex items-start gap-2 rounded-lg bg-rose-50 px-4 py-3 text-sm text-rose-700 ring-1 ring-rose-200">
          <XCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{fileError}</span>
        </div>
      )}

      {rows.length > 0 && (
        <>
          <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1 font-medium text-emerald-700 ring-1 ring-emerald-200">
              <CheckCircle className="h-3.5 w-3.5" />
              {ready} ready
            </span>
            {blocked > 0 && (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-rose-50 px-3 py-1 font-medium text-rose-700 ring-1 ring-rose-200">
                <XCircle className="h-3.5 w-3.5" />
                {blocked} blocked
              </span>
            )}
            {mismatches > 0 && (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-3 py-1 font-medium text-amber-700 ring-1 ring-amber-200">
                <AlertTriangle className="h-3.5 w-3.5" />
                {mismatches} VM password mismatch
              </span>
            )}
            {blocked > 0 && (
              <span className="text-gray-500">Blocked rows are skipped; the rest still run.</span>
            )}
          </div>

          {mismatches > 0 && (
            <div className="mt-3 flex items-start gap-2 rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-800 ring-1 ring-amber-200">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>
                The VM password in the file differs from the stored one on{' '}
                {mismatches === 1 ? 'one login' : `${mismatches} logins`}. The inventory value is
                kept and the user gets that. Edit the login in VM Inventory if the file is right.
              </span>
            </div>
          )}

          <div className="mt-3 max-h-80 overflow-auto rounded-lg border border-gray-100">
            <table className="w-full min-w-[720px] text-sm">
              <thead className="sticky top-0 border-b border-gray-100 bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500">
                <tr>
                  <th className="px-3 py-2">#</th>
                  <th className="px-3 py-2">IP</th>
                  <th className="px-3 py-2">VM username</th>
                  <th className="px-3 py-2">User email</th>
                  <th className="px-3 py-2">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {rows.map((r) => (
                  <tr key={r.index} className={r.error ? 'bg-rose-50/40' : undefined}>
                    <td className="px-3 py-2 text-xs text-gray-400">{r.index + 1}</td>
                    <td className="px-3 py-2 font-mono text-xs text-gray-900">
                      {r.ipAddress || '—'}
                    </td>
                    <td className="px-3 py-2 text-xs text-gray-700">{r.username || '—'}</td>
                    <td className="px-3 py-2 text-xs text-gray-700">{r.email || '—'}</td>
                    <td className="px-3 py-2 text-xs">
                      {r.error ? (
                        <span className="text-rose-600">{r.error}</span>
                      ) : r.passwordMismatch ? (
                        <span className="text-amber-700">Ready · VM password differs</span>
                      ) : (
                        <span className="text-emerald-700">Ready</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
