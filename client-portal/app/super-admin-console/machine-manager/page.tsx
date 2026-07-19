'use client';

import { useState } from 'react';
import { useAuth } from '../../../context/AuthContext';
import { useSoftwareCatalog } from '../../../hooks/useSoftwareCatalog';
import { ToastContainer, useToast } from '../../../components/ui/Toast';
import { ConfirmModal } from '../../../components/ui/ConfirmModal';
import { TableSkeleton } from '../../../components/dashboard/LoadingSkeleton';
import { ErrorState } from '../../../components/dashboard/ErrorState';
import {
  createSoftwareCatalogEntry,
  deleteSoftwareCatalogEntry,
  type ISoftwareCatalog,
  type MachineOS,
  type InstallMethod,
} from '../../../lib/machineManagerApi';
import { ApiError } from '../../../lib/apiClient';
import { BookOpen, RefreshCw, Trash2, Upload } from 'lucide-react';

const inputClass =
  'w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:border-[#B91C1C] focus:outline-none focus:ring-2 focus:ring-[#B91C1C]/20';
const labelClass = 'block text-sm font-medium text-gray-700 mb-1.5';

const OS_OPTIONS: { value: MachineOS; label: string }[] = [
  { value: 'windows', label: 'Windows' },
  { value: 'linux',   label: 'Linux' },
  { value: 'macos',   label: 'macOS' },
];

const INSTALL_METHODS: { value: InstallMethod; label: string; os: string }[] = [
  { value: 'choco',   label: 'Chocolatey',         os: 'Windows' },
  { value: 'winget',  label: 'Winget',             os: 'Windows' },
  { value: 'msi',     label: '.msi file',          os: 'Windows' },
  { value: 'exe',     label: '.exe file',          os: 'Windows' },
  { value: 'apt',     label: 'apt / yum / dnf',    os: 'Linux' },
  { value: 'brew',    label: 'Homebrew',           os: 'macOS' },
  { value: 'zip',     label: '.zip archive',       os: 'All' },
  { value: 'script',  label: 'Script (PS1/Shell)', os: 'All' },
];

function OSBadge({ os }: { os: MachineOS }) {
  const styles: Record<MachineOS, string> = {
    windows: 'bg-blue-50 text-blue-700 border-blue-200',
    linux:   'bg-green-50 text-green-700 border-green-200',
    macos:   'bg-gray-100 text-gray-600 border-gray-200',
  };
  return (
    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium capitalize ${styles[os]}`}>
      {os}
    </span>
  );
}

function MethodBadge({ method }: { method: InstallMethod }) {
  return (
    <span className="inline-flex items-center rounded-full border border-gray-200 bg-gray-100 px-2 py-0.5 text-xs font-medium uppercase text-gray-600">
      {method}
    </span>
  );
}

// Whether this install method needs a file URL
const FILE_METHODS: InstallMethod[] = ['msi', 'exe', 'zip', 'script'];
// Whether this install method needs a package identifier
const PKG_METHODS: InstallMethod[] = ['apt', 'brew', 'choco', 'winget'];

export default function SuperAdminSoftwareCatalogPage() {
  const { isAuthenticated } = useAuth();
  const { catalog, loading, error, refetch } = useSoftwareCatalog(isAuthenticated);
  const { toasts, addToast, dismiss } = useToast();

  const [pendingDelete, setPendingDelete] = useState<ISoftwareCatalog | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  // Form state
  const [name, setName] = useState('');
  const [version, setVersion] = useState('');
  const [selectedOS, setSelectedOS] = useState<MachineOS[]>([]);
  const [installMethod, setInstallMethod] = useState<InstallMethod>('choco');
  const [wingetId, setWingetId] = useState('');
  const [aptName, setAptName] = useState('');
  const [brewName, setBrewName] = useState('');
  const [chocoName, setChocoName] = useState('');
  const [fileUrl, setFileUrl] = useState('');
  const [fileName, setFileName] = useState('');
  const [installArgs, setInstallArgs] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const isFileBased = FILE_METHODS.includes(installMethod);
  const isPkgBased  = PKG_METHODS.includes(installMethod);

  const toggleOS = (os: MachineOS) =>
    setSelectedOS((prev) => prev.includes(os) ? prev.filter((o) => o !== os) : [...prev, os]);

  const canSubmit = !!(
    name.trim() && version.trim() && selectedOS.length > 0 &&
    (isFileBased ? fileUrl.trim() : true) &&
    (installMethod === 'apt'    ? aptName.trim() :
     installMethod === 'brew'   ? brewName.trim() :
     installMethod === 'choco'  ? chocoName.trim() :
     installMethod === 'winget' ? wingetId.trim() : true)
  ) && !submitting;

  const handleSubmit = async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    try {
      await createSoftwareCatalogEntry({
        name: name.trim(),
        version: version.trim(),
        supportedOS: selectedOS,
        installMethod,
        wingetId:    wingetId.trim()    || undefined,
        aptName:     aptName.trim()     || undefined,
        brewName:    brewName.trim()    || undefined,
        chocoName:   chocoName.trim()   || undefined,
        fileUrl:     fileUrl.trim()     || undefined,
        fileName:    fileName.trim()    || undefined,
        installArgs: installArgs.trim() || undefined,
      });
      addToast('success', `${name.trim()} added to catalog.`);
      // Reset form
      setName(''); setVersion(''); setSelectedOS([]); setInstallMethod('choco');
      setWingetId(''); setAptName(''); setBrewName(''); setChocoName('');
      setFileUrl(''); setFileName(''); setInstallArgs('');
      refetch();
    } catch (err) {
      addToast('error', err instanceof ApiError ? err.message : 'Failed to add software.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!pendingDelete) return;
    setDeleteLoading(true);
    try {
      await deleteSoftwareCatalogEntry(pendingDelete._id);
      addToast('success', `${pendingDelete.name} deleted.`);
      setPendingDelete(null);
      refetch();
    } catch (err) {
      addToast('error', err instanceof ApiError ? err.message : 'Failed to delete software.');
    } finally {
      setDeleteLoading(false);
    }
  };

  return (
    <div className="max-w-screen-xl space-y-8">
      <ToastContainer toasts={toasts} onDismiss={dismiss} />

      {pendingDelete && (
        <ConfirmModal
          open
          title="Delete software"
          description={`Permanently remove "${pendingDelete.name} v${pendingDelete.version}" from the catalog?`}
          confirmLabel="Delete"
          confirmVariant="danger"
          loading={deleteLoading}
          onConfirm={() => void handleDelete()}
          onCancel={() => setPendingDelete(null)}
        />
      )}

      <div>
        <h1 className="text-2xl font-bold text-gray-900">Software Catalog</h1>
        <p className="mt-0.5 text-sm text-gray-500">
          Add software packages that admins can install on their machines.
          Supports Chocolatey, apt/brew, .msi, .exe, .zip, and PowerShell/shell scripts.
        </p>
      </div>

      {/* ── Add Software form ──────────────────────────────────────────────── */}
      <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <h2 className="mb-5 text-base font-semibold text-gray-900">Add Software</h2>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {/* Name */}
          <div>
            <label className={labelClass}>Name <span className="text-red-500">*</span></label>
            <input className={inputClass} value={name} onChange={(e) => setName(e.target.value)} placeholder="Google Chrome" />
          </div>

          {/* Version */}
          <div>
            <label className={labelClass}>Version <span className="text-red-500">*</span></label>
            <input className={inputClass} value={version} onChange={(e) => setVersion(e.target.value)} placeholder="120.0.0" />
          </div>

          {/* Install method */}
          <div>
            <label className={labelClass}>Install method <span className="text-red-500">*</span></label>
            <select className={inputClass} value={installMethod} onChange={(e) => setInstallMethod(e.target.value as InstallMethod)}>
              {INSTALL_METHODS.map(({ value, label, os }) => (
                <option key={value} value={value}>{label} ({os})</option>
              ))}
            </select>
          </div>

          {/* Supported OS checkboxes */}
          <div>
            <label className={labelClass}>Supported OS <span className="text-red-500">*</span></label>
            <div className="flex gap-4 pt-1">
              {OS_OPTIONS.map(({ value, label }) => (
                <label key={value} className="flex cursor-pointer items-center gap-1.5 text-sm text-gray-700">
                  <input
                    type="checkbox"
                    checked={selectedOS.includes(value)}
                    onChange={() => toggleOS(value)}
                    className="h-4 w-4 rounded border-gray-300 text-[#B91C1C] focus:ring-[#B91C1C]"
                  />
                  {label}
                </label>
              ))}
            </div>
          </div>

          {/* Package manager IDs — shown only for pkg-based methods */}
          {installMethod === 'apt' && (
            <div className="sm:col-span-2">
              <label className={labelClass}>apt package name <span className="text-red-500">*</span></label>
              <input className={inputClass} value={aptName} onChange={(e) => setAptName(e.target.value)} placeholder="google-chrome-stable" />
            </div>
          )}
          {installMethod === 'brew' && (
            <div className="sm:col-span-2">
              <label className={labelClass}>Homebrew formula/cask <span className="text-red-500">*</span></label>
              <input className={inputClass} value={brewName} onChange={(e) => setBrewName(e.target.value)} placeholder="google-chrome" />
            </div>
          )}
          {installMethod === 'choco' && (
            <div className="sm:col-span-2">
              <label className={labelClass}>Chocolatey package name <span className="text-red-500">*</span></label>
              <input className={inputClass} value={chocoName} onChange={(e) => setChocoName(e.target.value)} placeholder="googlechrome" />
            </div>
          )}
          {installMethod === 'winget' && (
            <div className="sm:col-span-2">
              <label className={labelClass}>Winget package ID <span className="text-red-500">*</span></label>
              <input className={inputClass} value={wingetId} onChange={(e) => setWingetId(e.target.value)} placeholder="Postman.Postman" />
            </div>
          )}

          {/* File URL — shown only for file-based methods */}
          {isFileBased && (
            <>
              <div className="sm:col-span-2">
                <label className={labelClass}>File URL <span className="text-red-500">*</span></label>
                <input
                  className={inputClass}
                  value={fileUrl}
                  onChange={(e) => setFileUrl(e.target.value)}
                  placeholder="https://cdn.example.com/installer.msi"
                />
                <p className="mt-1 text-xs text-gray-400">
                  Direct URL to the {installMethod === 'script' ? 'script' : 'installer'} file.
                  Must be publicly accessible or behind a signed URL.
                </p>
              </div>
              <div>
                <label className={labelClass}>File name</label>
                <input className={inputClass} value={fileName} onChange={(e) => setFileName(e.target.value)} placeholder={`installer.${installMethod === 'script' ? 'ps1' : installMethod}`} />
              </div>
            </>
          )}

          {/* Extra install args */}
          <div className={isFileBased ? '' : 'sm:col-span-2'}>
            <label className={labelClass}>Extra install arguments <span className="text-gray-400 font-normal">(optional)</span></label>
            <input
              className={inputClass}
              value={installArgs}
              onChange={(e) => setInstallArgs(e.target.value)}
              placeholder={installMethod === 'script' ? '-param value' : ''}
            />
          </div>
        </div>

        <div className="mt-5 flex justify-end border-t border-gray-100 pt-5">
          <button
            onClick={() => void handleSubmit()}
            disabled={!canSubmit}
            className="inline-flex items-center gap-2 rounded-lg bg-[#B91C1C] px-4 py-2 text-sm font-medium text-white transition hover:bg-[#a01717] disabled:opacity-50"
          >
            {submitting ? (
              <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white border-t-transparent" />
            ) : (
              <Upload className="h-4 w-4" />
            )}
            Add to Catalog
          </button>
        </div>
      </div>

      {/* ── Catalog table ──────────────────────────────────────────────────── */}
      <div>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-base font-semibold text-gray-900">
            Catalog {!loading && `(${catalog.length})`}
          </h2>
          <button
            onClick={refetch}
            disabled={loading}
            className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs text-gray-600 transition hover:bg-gray-50 disabled:opacity-40"
          >
            <RefreshCw className={`h-3 w-3 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>

        {error && !loading ? (
          <ErrorState title="Failed to load catalog" message={error} onRetry={refetch} />
        ) : (
          <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
            {loading ? (
              <TableSkeleton rows={4} cols={6} />
            ) : catalog.length === 0 ? (
              <div className="p-16 text-center">
                <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-gray-100">
                  <BookOpen className="h-7 w-7 text-gray-400" />
                </div>
                <p className="font-medium text-gray-600">No software in catalog</p>
                <p className="mt-1 text-sm text-gray-400">Use the form above to add your first package.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-100 bg-gray-50">
                      {['Name', 'Version', 'Method', 'Supported OS', 'Package / File', 'Added', 'Actions'].map((h) => (
                        <th key={h} className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {catalog.map((sw, i) => (
                      <tr key={sw._id} className={`border-b border-gray-50 transition-colors hover:bg-gray-50 ${i % 2 !== 0 ? 'bg-gray-50/40' : ''}`}>
                        <td className="px-5 py-3 font-medium text-gray-900">{sw.name}</td>
                        <td className="px-5 py-3 text-gray-600">v{sw.version}</td>
                        <td className="px-5 py-3"><MethodBadge method={sw.installMethod} /></td>
                        <td className="px-5 py-3">
                          <div className="flex flex-wrap gap-1">
                            {sw.supportedOS.map((o) => <OSBadge key={o} os={o} />)}
                          </div>
                        </td>
                        <td className="px-5 py-3 font-mono text-xs text-gray-500">
                          {sw.wingetId || sw.aptName || sw.brewName || sw.chocoName || sw.fileName || sw.fileUrl || '—'}
                        </td>
                        <td className="px-5 py-3 text-xs text-gray-400">
                          {new Date(sw.createdAt).toLocaleDateString()}
                        </td>
                        <td className="px-5 py-3">
                          <button
                            onClick={() => setPendingDelete(sw)}
                            className="inline-flex items-center gap-1.5 rounded-lg border border-red-200 bg-red-50 px-3 py-1.5 text-xs font-medium text-red-700 transition hover:bg-red-100"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                            Delete
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
