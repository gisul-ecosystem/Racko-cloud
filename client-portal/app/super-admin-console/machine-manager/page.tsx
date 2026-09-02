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
  updateSoftwareCatalogEntry,
  deleteSoftwareCatalogEntry,
  issueSoftwareCatalogUploadUrl,
  type ISoftwareCatalog,
  type MachineOS,
  type InstallMethod,
} from '../../../lib/machineManagerApi';
import { ApiError } from '../../../lib/apiClient';
import { BookOpen, RefreshCw, Trash2, Upload, Pencil, X, FileCheck, AlertCircle } from 'lucide-react';

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

// Whether this install method needs a file URL
const FILE_METHODS: InstallMethod[] = ['msi', 'exe', 'zip', 'script'];
// Whether this install method needs a package identifier
const PKG_METHODS: InstallMethod[] = ['apt', 'brew', 'choco', 'winget'];

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

function SoftwareAvatar({ name, iconUrl }: { name: string; iconUrl?: string }) {
  const [iconFailed, setIconFailed] = useState(false);
  const initials = name
    .split(/\s+/)
    .map((part) => part.trim())
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('') || 'SW';

  if (iconUrl && !iconFailed) {
    return (
      <img
        src={iconUrl}
        alt={`${name} icon`}
        onError={() => setIconFailed(true)}
        className="h-8 w-8 rounded-md border border-gray-200 bg-white object-contain p-1"
      />
    );
  }

  return (
    <div className="flex h-8 w-8 items-center justify-center rounded-md border border-gray-200 bg-gray-100 text-[10px] font-semibold text-gray-700">
      {initials}
    </div>
  );
}

// ─── Edit Software Modal ───────────────────────────────────────────────────────

interface EditSoftwareModalProps {
  item: ISoftwareCatalog;
  onClose: () => void;
  onSaved: () => void;
}

function EditSoftwareModal({ item, onClose, onSaved }: EditSoftwareModalProps) {
  // Determine if the current stored file is an internal SeaweedFS ref or an external URL
  const isInternalRef = (url?: string) => !!url && url.startsWith('software-catalog/');

  const [name, setName]                     = useState(item.name);
  const [version, setVersion]               = useState(item.version ?? '');
  const [iconUrl, setIconUrl]               = useState(item.iconUrl ?? '');
  const [selectedOS, setSelectedOS]         = useState<MachineOS[]>(item.supportedOS);
  const [installMethod, setInstallMethod]   = useState<InstallMethod>(item.installMethod);
  const [wingetId, setWingetId]             = useState(item.wingetId ?? '');
  const [aptName, setAptName]               = useState(item.aptName ?? '');
  const [brewName, setBrewName]             = useState(item.brewName ?? '');
  const [chocoName, setChocoName]           = useState(item.chocoName ?? '');
  const [installArgs, setInstallArgs]       = useState(item.installArgs ?? '');
  const [zipInstallScript, setZipInstallScript] = useState(item.zipInstallScript ?? '');

  // File state — tracks what's happening with the installer file
  // 'keep'    = keep the existing file (no change)
  // 'replace' = user has uploaded a new file (new storageRef ready)
  // 'url'     = user wants to use / has edited a direct URL
  type FileMode = 'keep' | 'replace' | 'url';
  const initialFileMode: FileMode = isInternalRef(item.fileUrl) ? 'keep' : item.fileUrl ? 'url' : 'keep';
  const [fileMode, setFileMode]             = useState<FileMode>(initialFileMode);
  const [fileUrl, setFileUrl]               = useState(isInternalRef(item.fileUrl) ? '' : (item.fileUrl ?? ''));
  const [fileName, setFileName]             = useState(item.fileName ?? '');
  // New upload state
  const [uploadingFile, setUploadingFile]   = useState(false);
  const [newStorageRef, setNewStorageRef]   = useState('');
  const [newUploadedName, setNewUploadedName] = useState('');

  const [saving, setSaving]                 = useState(false);
  const [error, setError]                   = useState<string | null>(null);

  const isFileBased = FILE_METHODS.includes(installMethod);
  const isPkgBased  = PKG_METHODS.includes(installMethod);

  const toggleOS = (os: MachineOS) =>
    setSelectedOS((prev) => prev.includes(os) ? prev.filter((o) => o !== os) : [...prev, os]);

  // When install method changes, reset file state if switching between file/pkg categories
  const handleMethodChange = (method: InstallMethod) => {
    setInstallMethod(method);
    // If switching away from the original file-based method, clear any pending upload
    if (!FILE_METHODS.includes(method)) {
      setFileMode('keep');
      setNewStorageRef('');
      setNewUploadedName('');
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingFile(true);
    setNewStorageRef('');
    setNewUploadedName('');
    try {
      const { presignedUrl, storageRef } = await issueSoftwareCatalogUploadUrl(
        file.name,
        file.type || 'application/octet-stream'
      );
      const uploadRes = await fetch(presignedUrl, {
        method: 'PUT',
        body: file,
        headers: { 'Content-Type': file.type || 'application/octet-stream' },
      });
      if (!uploadRes.ok) throw new Error(`Upload failed: ${uploadRes.status}`);
      setNewStorageRef(storageRef);
      setNewUploadedName(file.name);
      if (!fileName) setFileName(file.name);
      setFileMode('replace');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'File upload failed.');
    } finally {
      setUploadingFile(false);
      e.target.value = '';
    }
  };

  const canSave = !!(
    name.trim() &&
    selectedOS.length > 0 &&
    !uploadingFile &&
    !saving &&
    (installMethod === 'apt'    ? aptName.trim() :
     installMethod === 'brew'   ? brewName.trim() :
     installMethod === 'choco'  ? chocoName.trim() :
     installMethod === 'winget' ? wingetId.trim() : true) &&
    (isFileBased && installMethod !== 'zip' ? (fileMode === 'keep' ? !!item.fileUrl : fileMode === 'replace' ? !!newStorageRef : !!fileUrl.trim()) : true) &&
    (installMethod === 'zip' ? zipInstallScript.trim() : true)
  );

  const handleSave = async () => {
    if (!canSave) return;
    setError(null);
    setSaving(true);

    try {
      // Build patch payload — only send fields that differ from the original
      // This is a partial update so unchanged fields aren't touched on the server
      const patch: Record<string, unknown> = {};

      if (name.trim() !== item.name) patch['name'] = name.trim();
      if ((version.trim() || 'latest') !== (item.version ?? 'latest')) patch['version'] = version.trim() || 'latest';
      if (iconUrl.trim() !== (item.iconUrl ?? '')) patch['iconUrl'] = iconUrl.trim() || '';
      if (JSON.stringify([...selectedOS].sort()) !== JSON.stringify([...item.supportedOS].sort()))
        patch['supportedOS'] = selectedOS;
      if (installMethod !== item.installMethod) patch['installMethod'] = installMethod;

      // Package IDs — clear the old ones if method changed
      if (wingetId.trim() !== (item.wingetId ?? '')) patch['wingetId'] = wingetId.trim();
      if (aptName.trim() !== (item.aptName ?? '')) patch['aptName'] = aptName.trim();
      if (brewName.trim() !== (item.brewName ?? '')) patch['brewName'] = brewName.trim();
      if (chocoName.trim() !== (item.chocoName ?? '')) patch['chocoName'] = chocoName.trim();
      if (installArgs.trim() !== (item.installArgs ?? '')) patch['installArgs'] = installArgs.trim();
      if (fileName.trim() !== (item.fileName ?? '')) patch['fileName'] = fileName.trim();
      if (zipInstallScript.trim() !== (item.zipInstallScript ?? '')) patch['zipInstallScript'] = zipInstallScript.trim();

      // File URL handling
      if (isFileBased) {
        if (fileMode === 'replace' && newStorageRef) {
          // New file uploaded — send new storageRef; backend will delete old file from SeaweedFS
          patch['fileUrl'] = newStorageRef;
        } else if (fileMode === 'url' && fileUrl.trim() !== (isInternalRef(item.fileUrl) ? '' : (item.fileUrl ?? ''))) {
          // External URL changed
          patch['fileUrl'] = fileUrl.trim();
        }
        // fileMode === 'keep' → don't send fileUrl, server keeps existing value
      } else if (!isFileBased && isInternalRef(item.fileUrl)) {
        // Switched from file-based to pkg-based — clear the file reference
        patch['fileUrl'] = '';
        patch['fileName'] = '';
      }

      await updateSoftwareCatalogEntry(item._id, patch);
      onSaved();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to save changes.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="relative flex max-h-[92vh] w-full max-w-2xl flex-col rounded-2xl border border-gray-200 bg-white shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-gray-100 px-6 py-4">
          <div>
            <h2 className="text-base font-semibold text-gray-900">Edit Software</h2>
            <p className="mt-0.5 text-xs text-gray-400">{item.name}</p>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-gray-400 transition hover:bg-gray-100 hover:text-gray-600"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-5">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">

            {/* Name */}
            <div>
              <label className={labelClass}>Name <span className="text-red-500">*</span></label>
              <input className={inputClass} value={name} onChange={(e) => setName(e.target.value)} />
            </div>

            {/* Version */}
            <div>
              <label className={labelClass}>Version</label>
              <input className={inputClass} value={version} onChange={(e) => setVersion(e.target.value)} placeholder="latest" />
            </div>

            {/* Icon URL */}
            <div className="sm:col-span-2">
              <label className={labelClass}>Icon URL <span className="text-gray-400 font-normal">(optional)</span></label>
              <input className={inputClass} value={iconUrl} onChange={(e) => setIconUrl(e.target.value)} placeholder="https://cdn.simpleicons.org/googlechrome" />
            </div>

            {/* Install method */}
            <div>
              <label className={labelClass}>Install method <span className="text-red-500">*</span></label>
              <select className={inputClass} value={installMethod} onChange={(e) => handleMethodChange(e.target.value as InstallMethod)}>
                {INSTALL_METHODS.map(({ value, label, os }) => (
                  <option key={value} value={value}>{label} ({os})</option>
                ))}
              </select>
            </div>

            {/* Supported OS */}
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

            {/* Package IDs */}
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

            {/* File section — only for file-based install methods */}
            {isFileBased && (
              <div className="sm:col-span-2 space-y-3">
                <label className={labelClass}>Installer File</label>

                {/* Current file status */}
                {isInternalRef(item.fileUrl) && fileMode === 'keep' && (
                  <div className="flex items-center justify-between rounded-lg border border-green-200 bg-green-50 px-3 py-2.5">
                    <div className="flex items-center gap-2 text-sm text-green-700">
                      <FileCheck className="h-4 w-4 flex-shrink-0" />
                      <span className="font-medium">Current file:</span>
                      <span className="font-mono text-xs">{item.fileName ?? 'Uploaded file'}</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => setFileMode('replace')}
                      className="text-xs font-medium text-green-700 underline hover:no-underline"
                    >
                      Replace
                    </button>
                  </div>
                )}

                {/* Replace file upload */}
                {(fileMode === 'replace' || (!isInternalRef(item.fileUrl) && !item.fileUrl)) && (
                  <div className="space-y-2">
                    <div className="flex items-center gap-3">
                      <label className={`inline-flex cursor-pointer items-center gap-2 rounded-lg border px-4 py-2 text-sm font-medium transition ${
                        uploadingFile
                          ? 'cursor-not-allowed border-gray-200 bg-gray-50 text-gray-400'
                          : 'border-[#B91C1C] bg-red-50 text-[#B91C1C] hover:bg-red-100'
                      }`}>
                        {uploadingFile
                          ? <><span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-gray-400 border-t-transparent" /> Uploading…</>
                          : <><Upload className="h-4 w-4" /> {fileMode === 'replace' ? 'Upload New File' : 'Choose File'}</>
                        }
                        <input
                          type="file"
                          accept={installMethod === 'msi' ? '.msi' : installMethod === 'exe' ? '.exe' : installMethod === 'zip' ? '.zip' : '.ps1,.sh'}
                          disabled={uploadingFile}
                          onChange={(e) => void handleFileUpload(e)}
                          className="hidden"
                        />
                      </label>
                      {newUploadedName && (
                        <div className="flex items-center gap-2 rounded-lg border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-700">
                          <span className="h-2 w-2 rounded-full bg-green-500" />
                          {newUploadedName}
                          <button
                            type="button"
                            onClick={() => {
                              setNewStorageRef('');
                              setNewUploadedName('');
                              setFileMode(isInternalRef(item.fileUrl) ? 'keep' : 'url');
                            }}
                            className="ml-1 text-green-500 hover:text-green-700"
                          >
                            ✕
                          </button>
                        </div>
                      )}
                    </div>
                    {fileMode === 'replace' && isInternalRef(item.fileUrl) && !newUploadedName && (
                      <button
                        type="button"
                        onClick={() => setFileMode('keep')}
                        className="text-xs text-gray-500 underline hover:no-underline"
                      >
                        ← Keep existing file
                      </button>
                    )}
                  </div>
                )}

                {/* External URL option — shown when not using internal file */}
                {(!isInternalRef(item.fileUrl) || fileMode === 'url') && fileMode !== 'replace' && (
                  <div>
                    <p className="mb-1.5 text-xs text-gray-400">
                      {isInternalRef(item.fileUrl) ? 'Or paste a direct download URL:' : 'Direct download URL:'}
                    </p>
                    <input
                      className={inputClass}
                      value={fileUrl}
                      onChange={(e) => { setFileUrl(e.target.value); setFileMode('url'); }}
                      placeholder={`https://cdn.example.com/installer.${installMethod === 'script' ? 'ps1' : installMethod}`}
                    />
                  </div>
                )}

                {/* Or use URL instead of internal file */}
                {isInternalRef(item.fileUrl) && fileMode === 'keep' && (
                  <button
                    type="button"
                    onClick={() => setFileMode('url')}
                    className="text-xs text-gray-500 underline hover:no-underline"
                  >
                    Switch to direct URL instead
                  </button>
                )}

                {/* File name */}
                <div>
                  <label className={labelClass}>File name <span className="text-gray-400 font-normal">(optional)</span></label>
                  <input className={inputClass} value={fileName} onChange={(e) => setFileName(e.target.value)} placeholder={`installer.${installMethod === 'script' ? 'ps1' : installMethod}`} />
                </div>

                {/* ZIP install script */}
                {installMethod === 'zip' && (
                  <div>
                    <label className={labelClass}>Install Script (PowerShell) <span className="text-red-500">*</span></label>
                    <textarea
                      className={`${inputClass} resize-y font-mono text-xs`}
                      rows={6}
                      value={zipInstallScript}
                      onChange={(e) => setZipInstallScript(e.target.value)}
                      placeholder={`# $extractDir is set to the folder where the ZIP was extracted\n$dest = "C:\\Program Files\\MyApp"\nNew-Item -ItemType Directory -Force -Path $dest | Out-Null\nCopy-Item "$extractDir\\*" $dest -Recurse -Force`}
                    />
                    <p className="mt-1 text-xs text-gray-400">
                      Use <code className="rounded bg-gray-100 px-1">$extractDir</code> to reference the extracted folder.
                    </p>
                  </div>
                )}
              </div>
            )}

            {/* Extra install args */}
            <div className="sm:col-span-2">
              <label className={labelClass}>Extra install arguments <span className="text-gray-400 font-normal">(optional)</span></label>
              <input className={inputClass} value={installArgs} onChange={(e) => setInstallArgs(e.target.value)} placeholder="" />
            </div>

          </div>

          {error && (
            <div className="mt-4 flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-700">
              <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0" />
              {error}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 border-t border-gray-100 px-6 py-4">
          <button
            onClick={onClose}
            disabled={saving}
            className="rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-600 transition hover:bg-gray-50 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={() => void handleSave()}
            disabled={!canSave}
            className="inline-flex items-center gap-2 rounded-lg bg-[#B91C1C] px-4 py-2 text-sm font-medium text-white transition hover:bg-[#a01717] disabled:opacity-50"
          >
            {saving && <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white border-t-transparent" />}
            Save changes
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Main Page ─────────────────────────────────────────────────────────────────

export default function SuperAdminSoftwareCatalogPage() {
  const { isAuthenticated } = useAuth();
  const { catalog, loading, error, refetch } = useSoftwareCatalog(isAuthenticated);
  const { toasts, addToast, dismiss } = useToast();

  const [pendingDelete, setPendingDelete] = useState<ISoftwareCatalog | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [editItem, setEditItem]           = useState<ISoftwareCatalog | null>(null);

  // Form state
  const [name, setName] = useState('');
  const [version, setVersion] = useState('');
  const [iconUrl, setIconUrl] = useState('');
  const [selectedOS, setSelectedOS] = useState<MachineOS[]>([]);
  const [installMethod, setInstallMethod] = useState<InstallMethod>('choco');
  const [wingetId, setWingetId] = useState('');
  const [aptName, setAptName] = useState('');
  const [brewName, setBrewName] = useState('');
  const [chocoName, setChocoName] = useState('');
  const [fileUrl, setFileUrl] = useState('');
  const [fileName, setFileName] = useState('');
  const [zipInstallScript, setZipInstallScript] = useState('');
  const [installArgs, setInstallArgs] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // File upload state — for msi/exe/zip/script install methods
  const [uploadingFile, setUploadingFile] = useState(false);
  const [uploadedFileName, setUploadedFileName] = useState(''); // display name of uploaded file
  const [storageRef, setStorageRef] = useState(''); // storageRef returned by upload

  const isFileBased = FILE_METHODS.includes(installMethod);
  const isPkgBased  = PKG_METHODS.includes(installMethod);

  const toggleOS = (os: MachineOS) =>
    setSelectedOS((prev) => prev.includes(os) ? prev.filter((o) => o !== os) : [...prev, os]);

  const canSubmit = !!(
    name.trim() && selectedOS.length > 0 &&
    (isFileBased ? (storageRef || fileUrl.trim()) : true) &&
    (installMethod === 'zip' ? zipInstallScript.trim() : true) &&
    (installMethod === 'apt'    ? aptName.trim() :
     installMethod === 'brew'   ? brewName.trim() :
     installMethod === 'choco'  ? chocoName.trim() :
     installMethod === 'winget' ? wingetId.trim() : true)
  ) && !submitting && !uploadingFile;

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingFile(true);
    setUploadedFileName('');
    setStorageRef('');
    try {
      const { presignedUrl, storageRef: ref } = await issueSoftwareCatalogUploadUrl(
        file.name,
        file.type || 'application/octet-stream'
      );
      // Upload directly to SeaweedFS — no file bytes through the API
      const uploadRes = await fetch(presignedUrl, {
        method: 'PUT',
        body: file,
        headers: { 'Content-Type': file.type || 'application/octet-stream' },
      });
      if (!uploadRes.ok) throw new Error(`Upload failed: ${uploadRes.status}`);
      setStorageRef(ref);
      setUploadedFileName(file.name);
      if (!fileName) setFileName(file.name);
      addToast('success', `${file.name} uploaded successfully.`);
    } catch (err) {
      addToast('error', err instanceof Error ? err.message : 'File upload failed.');
    } finally {
      setUploadingFile(false);
      // Reset file input so same file can be re-selected
      e.target.value = '';
    }
  };

  const handleSubmit = async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    try {
      await createSoftwareCatalogEntry({
        name: name.trim(),
        version: version.trim() || 'latest',
        iconUrl: iconUrl.trim() || undefined,
        supportedOS: selectedOS,
        installMethod,
        wingetId:    wingetId.trim()    || undefined,
        aptName:     aptName.trim()     || undefined,
        brewName:    brewName.trim()    || undefined,
        chocoName:   chocoName.trim()   || undefined,
        // Use storageRef if file was uploaded, otherwise fall back to manual URL
        fileUrl:     storageRef || fileUrl.trim() || undefined,
        fileName:    fileName.trim()    || undefined,
        zipInstallScript: zipInstallScript.trim() || undefined,
        installArgs: installArgs.trim() || undefined,
      });
      addToast('success', `${name.trim()} added to catalog.`);
      // Reset form
      setName(''); setVersion(''); setIconUrl(''); setSelectedOS([]); setInstallMethod('choco');
      setWingetId(''); setAptName(''); setBrewName(''); setChocoName('');
      setFileUrl(''); setFileName(''); setZipInstallScript(''); setInstallArgs('');
      setStorageRef(''); setUploadedFileName('');
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

      {editItem && (
        <EditSoftwareModal
          item={editItem}
          onClose={() => setEditItem(null)}
          onSaved={() => {
            setEditItem(null);
            addToast('success', `${editItem.name} updated successfully.`);
            refetch();
          }}
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
            <label className={labelClass}>Version <span className="text-gray-400 font-normal">(optional)</span></label>
            <input className={inputClass} value={version} onChange={(e) => setVersion(e.target.value)} placeholder="e.g. 3.12.0 — leave blank for latest" />
          </div>

          <div className="sm:col-span-2">
            <label className={labelClass}>Icon URL <span className="text-gray-400 font-normal">(optional)</span></label>
            <input
              className={inputClass}
              value={iconUrl}
              onChange={(e) => setIconUrl(e.target.value)}
              placeholder="https://cdn.simpleicons.org/googlechrome"
            />
            <p className="mt-1 text-xs text-gray-400">
              Leave blank to auto-assign an icon for known software names.
            </p>
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

          {/* File upload — shown only for file-based methods */}
          {isFileBased && (
            <>
              <div className="sm:col-span-2">
                <label className={labelClass}>
                  Installer File <span className="text-red-500">*</span>
                </label>
                {/* Option A: Upload file directly to SeaweedFS */}
                <div className="space-y-3">
                  <div className="flex items-center gap-3">
                    <label className={`inline-flex cursor-pointer items-center gap-2 rounded-lg border px-4 py-2 text-sm font-medium transition ${
                      uploadingFile
                        ? 'border-gray-200 bg-gray-50 text-gray-400 cursor-not-allowed'
                        : 'border-[#B91C1C] bg-red-50 text-[#B91C1C] hover:bg-red-100'
                    }`}>
                      {uploadingFile
                        ? <><span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-gray-400 border-t-transparent" /> Uploading…</>
                        : <><Upload className="h-4 w-4" /> Choose File</>
                      }
                      <input
                        type="file"
                        accept={installMethod === 'msi' ? '.msi' : installMethod === 'exe' ? '.exe' : installMethod === 'zip' ? '.zip' : '.ps1,.sh'}
                        disabled={uploadingFile}
                        onChange={(e) => void handleFileUpload(e)}
                        className="hidden"
                      />
                    </label>
                    {uploadedFileName && (
                      <div className="flex items-center gap-2 rounded-lg border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-700">
                        <span className="h-2 w-2 rounded-full bg-green-500" />
                        {uploadedFileName}
                        <button
                          type="button"
                          onClick={() => { setStorageRef(''); setUploadedFileName(''); }}
                          className="ml-1 text-green-500 hover:text-green-700"
                        >
                          ✕
                        </button>
                      </div>
                    )}
                  </div>
                  {/* Option B: Paste a direct URL (for external CDN / public URLs) */}
                  <div>
                    <p className="mb-1.5 text-xs text-gray-400">Or paste a direct download URL:</p>
                    <input
                      className={inputClass}
                      value={fileUrl}
                      onChange={(e) => setFileUrl(e.target.value)}
                      placeholder={`https://cdn.example.com/installer.${installMethod === 'script' ? 'ps1' : installMethod}`}
                      disabled={!!storageRef}
                    />
                  </div>
                </div>
              </div>
              <div>
                <label className={labelClass}>File name <span className="text-gray-400 font-normal">(optional)</span></label>
                <input className={inputClass} value={fileName} onChange={(e) => setFileName(e.target.value)} placeholder={`installer.${installMethod === 'script' ? 'ps1' : installMethod}`} />
              </div>

              {/* ZIP install script — required for zip method */}
              {installMethod === 'zip' && (
                <div className="sm:col-span-2">
                  <label className={labelClass}>
                    Install Script (PowerShell) <span className="text-red-500">*</span>
                  </label>
                  <textarea
                    className={`${inputClass} resize-y font-mono text-xs`}
                    rows={6}
                    value={zipInstallScript}
                    onChange={(e) => setZipInstallScript(e.target.value)}
                    placeholder={`# $extractDir is set to the folder where the ZIP was extracted\n# Example: copy portable app to Program Files\n$dest = "C:\\Program Files\\MyApp"\nNew-Item -ItemType Directory -Force -Path $dest | Out-Null\nCopy-Item "$extractDir\\*" $dest -Recurse -Force\n# Create desktop shortcut\n$shell = New-Object -ComObject WScript.Shell\n$sc = $shell.CreateShortcut("$env:PUBLIC\\Desktop\\MyApp.lnk")\n$sc.TargetPath = "$dest\\myapp.exe"\n$sc.Save()`}
                  />
                  <p className="mt-1 text-xs text-gray-400">
                    The ZIP is extracted to a temp folder. Use <code className="rounded bg-gray-100 px-1">$extractDir</code> to reference it. Script runs as admin in PowerShell.
                  </p>
                </div>
              )}
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
              <TableSkeleton rows={4} cols={7} />
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
                      {['Software', 'Version', 'Method', 'Supported OS', 'Package / File', 'Added', 'Actions'].map((h) => (
                        <th key={h} className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {catalog.map((sw, i) => (
                      <tr key={sw._id} className={`border-b border-gray-50 transition-colors hover:bg-gray-50 ${i % 2 !== 0 ? 'bg-gray-50/40' : ''}`}>
                        <td className="px-5 py-3">
                          <div className="flex items-center gap-2.5">
                            <SoftwareAvatar name={sw.name} iconUrl={sw.iconUrl} />
                            <span className="font-medium text-gray-900">{sw.name}</span>
                          </div>
                        </td>
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
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => setEditItem(sw)}
                              className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 transition hover:bg-gray-50"
                            >
                              <Pencil className="h-3.5 w-3.5" />
                              Edit
                            </button>
                            <button
                              onClick={() => setPendingDelete(sw)}
                              className="inline-flex items-center gap-1.5 rounded-lg border border-red-200 bg-red-50 px-3 py-1.5 text-xs font-medium text-red-700 transition hover:bg-red-100"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                              Delete
                            </button>
                          </div>
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
