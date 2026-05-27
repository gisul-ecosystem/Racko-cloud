'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '../../../../../context/AuthContext';
import { useTemplates, useTemplateDetails } from '../../../../../hooks/useTemplates';
import { createVM } from '../../../../../lib/vmApi';
import { ApiError } from '../../../../../lib/apiClient';
import { ToastContainer, useToast } from '../../../../../components/ui/Toast';
import {
  Server, ChevronRight, ChevronLeft, Check,
  Cpu, MemoryStick, HardDrive, Layers,
} from 'lucide-react';

type Step = 1 | 2 | 3;

const inputClass =
  'w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white text-gray-900 placeholder-gray-400';

const labelClass = 'block text-xs font-medium text-gray-700 mb-1';

export default function CreateVMPage() {
  const router = useRouter();
  const { isAuthenticated } = useAuth();
  const { templates, loading: templatesLoading, error: templatesError } = useTemplates(isAuthenticated);
  const { toasts, addToast, dismiss } = useToast();

  // Step state
  const [step, setStep] = useState<Step>(1);

  // Step 1 — template selection
  const [selectedTemplateId, setSelectedTemplateId] = useState<number | null>(null);
  const { details: templateDetails, loading: detailsLoading } = useTemplateDetails(selectedTemplateId);

  // Step 2 — configuration
  const [name, setName] = useState('');
  const [count, setCount] = useState(1);
  const [cloneType, setCloneType] = useState<'dedicated_storage' | 'dynamic_storage'>('dedicated_storage');
  const [cpuOverride, setCpuOverride] = useState('');
  const [ramOverride, setRamOverride] = useState('');
  const [diskOverride, setDiskOverride] = useState('');
  const [description, setDescription] = useState('');
  const [nameError, setNameError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Validation helpers
  const minCpu = templateDetails?.cpuCores ?? 1;
  const minRam = templateDetails?.memoryGb ?? 0.5;
  const minDisk = templateDetails?.diskGb ?? 10;

  const cpuVal = cpuOverride ? parseInt(cpuOverride, 10) : minCpu;
  const ramVal = ramOverride ? parseFloat(ramOverride) : minRam;
  const diskVal = diskOverride ? parseInt(diskOverride, 10) : minDisk;

  // NaN-safe: treat invalid input as 0 so errors show correctly
  const safeCpu = isNaN(cpuVal) ? 0 : cpuVal;
  const safeRam = isNaN(ramVal) ? 0 : ramVal;
  const safeDisk = isNaN(diskVal) ? 0 : diskVal;

  const cpuError = cpuOverride && (isNaN(cpuVal) || safeCpu < minCpu)
    ? isNaN(cpuVal) ? 'Enter a valid number.' : `Minimum ${minCpu} core${minCpu !== 1 ? 's' : ''} required (template default)`
    : null;
  const ramError = ramOverride && (isNaN(ramVal) || safeRam < minRam)
    ? isNaN(ramVal) ? 'Enter a valid number.' : `Minimum ${minRam} GB RAM required (template default)`
    : null;
  const diskError = diskOverride && (isNaN(diskVal) || safeDisk < minDisk)
    ? isNaN(diskVal) ? 'Enter a valid number.' : `Minimum ${minDisk} GB disk required (template default)`
    : null;

  function validateName(val: string): string {
    if (!val) return 'Name is required.';
    if (val.length < 3) return 'Minimum 3 characters.';
    if (val.length > 50) return 'Maximum 50 characters.';
    if (!/^[a-zA-Z0-9-]+$/.test(val)) return 'Only letters, numbers, and hyphens.';
    return '';
  }

  function canProceedStep1() {
    return selectedTemplateId !== null && !detailsLoading;
  }

  function canProceedStep2() {
    const err = validateName(name);
    return !err && count >= 1 && count <= 100 &&
      !cpuError && !ramError && !diskError &&
      safeCpu >= minCpu && safeRam >= minRam && safeDisk >= minDisk;
  }

  async function handleSubmit() {
    if (!selectedTemplateId || !templateDetails) return;
    setSubmitting(true);
    try {
      const dto = {
        templateId: selectedTemplateId,
        name: name.toLowerCase(),
        count,
        cloneType,
        ...(cpuOverride && safeCpu > minCpu ? { cpuCores: safeCpu } : {}),
        ...(ramOverride && safeRam > minRam ? { memoryGb: safeRam } : {}),
        ...(diskOverride && safeDisk > minDisk ? { diskGb: safeDisk } : {}),
        ...(description ? { description } : {}),
      };

      const result = await createVM(dto);
      addToast('success', count === 1 ? 'VM creation started.' : `Bulk job started for ${count} VMs.`);
      router.push(`/dashboard/admin/jobs/${result.jobId}`);
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : 'Failed to create VM.';
      addToast('error', msg);
    } finally {
      setSubmitting(false);
    }
  }

  const selectedTemplate = templates.find((t) => t.vmid === selectedTemplateId);

  return (
    <div className="max-w-2xl">
      <ToastContainer toasts={toasts} onDismiss={dismiss} />

      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Create VM</h1>
        <p className="text-gray-500 text-sm mt-0.5">Provision a new virtual machine from a template</p>
      </div>

      {/* Step indicator */}
      <div className="flex items-center gap-2 mb-8">
        {([1, 2, 3] as Step[]).map((s, idx) => (
          <div key={s} className="flex items-center gap-2">
            <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-semibold transition-colors ${
              step > s ? 'bg-blue-600 text-white' :
              step === s ? 'bg-blue-600 text-white' :
              'bg-gray-100 text-gray-400'
            }`}>
              {step > s ? <Check className="w-3.5 h-3.5" /> : s}
            </div>
            <span className={`text-xs font-medium ${step === s ? 'text-gray-900' : 'text-gray-400'}`}>
              {['Select Template', 'Configure', 'Review'][idx]}
            </span>
            {idx < 2 && <ChevronRight className="w-3.5 h-3.5 text-gray-300 mx-1" />}
          </div>
        ))}
      </div>

      {/* Step 1 — Template selection */}
      {step === 1 && (
        <div className="bg-white border border-gray-200 rounded-xl shadow-sm p-6">
          <h2 className="text-sm font-semibold text-gray-900 mb-4">Choose a template</h2>

          {templatesLoading ? (
            <div className="space-y-3">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="h-16 bg-gray-100 rounded-xl animate-pulse" />
              ))}
            </div>
          ) : templatesError ? (
            <p className="text-red-500 text-sm">{templatesError}</p>
          ) : templates.length === 0 ? (
            <p className="text-gray-400 text-sm">No templates available on any node.</p>
          ) : (
            <div className="space-y-2">
              {templates.map((tpl) => {
                const isSelected = selectedTemplateId === tpl.vmid;
                return (
                  <button
                    key={tpl.vmid}
                    onClick={() => setSelectedTemplateId(tpl.vmid)}
                    className={`w-full text-left px-4 py-3.5 rounded-xl border transition-all ${
                      isSelected
                        ? 'border-blue-500 bg-blue-50 ring-1 ring-blue-500'
                        : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${isSelected ? 'bg-blue-100' : 'bg-gray-100'}`}>
                          <Server className={`w-4 h-4 ${isSelected ? 'text-blue-600' : 'text-gray-500'}`} />
                        </div>
                        <div>
                          <p className="text-sm font-medium text-gray-900">{tpl.name}</p>
                          <p className="text-xs text-gray-400">Node: {tpl.node} · ID: {tpl.vmid}</p>
                        </div>
                      </div>
                      {isSelected && <Check className="w-4 h-4 text-blue-600" />}
                    </div>
                  </button>
                );
              })}
            </div>
          )}

          {/* Template details preview */}
          {selectedTemplateId && templateDetails && (
            <div className="mt-4 p-4 bg-gray-50 rounded-xl border border-gray-100">
              <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-3">Template specs</p>
              <div className="grid grid-cols-3 gap-3">
                <div className="flex items-center gap-2">
                  <Cpu className="w-3.5 h-3.5 text-gray-400" />
                  <span className="text-xs text-gray-600">{templateDetails.cpuCores} vCPU</span>
                </div>
                <div className="flex items-center gap-2">
                  <MemoryStick className="w-3.5 h-3.5 text-gray-400" />
                  <span className="text-xs text-gray-600">{templateDetails.memoryGb} GB RAM</span>
                </div>
                <div className="flex items-center gap-2">
                  <HardDrive className="w-3.5 h-3.5 text-gray-400" />
                  <span className="text-xs text-gray-600">{templateDetails.diskGb} GB disk</span>
                </div>
              </div>
            </div>
          )}

          <div className="flex justify-end mt-6">
            <button
              onClick={() => setStep(2)}
              disabled={!canProceedStep1()}
              className="inline-flex items-center gap-2 px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Next
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* Step 2 — Configuration */}
      {step === 2 && templateDetails && (
        <div className="bg-white border border-gray-200 rounded-xl shadow-sm p-6 space-y-5">
          <h2 className="text-sm font-semibold text-gray-900">Configure VM</h2>

          {/* Name */}
          <div>
            <label className={labelClass}>
              VM Name {count > 1 && <span className="text-gray-400">(used as prefix: name-1, name-2…)</span>}
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => { setName(e.target.value); setNameError(validateName(e.target.value)); }}
              onBlur={() => setNameError(validateName(name))}
              placeholder="my-vm"
              className={`${inputClass} ${nameError ? 'border-red-300 focus:ring-red-500' : ''}`}
            />
            {nameError && <p className="text-xs text-red-500 mt-1">{nameError}</p>}
            <p className="text-xs text-gray-400 mt-1">Letters, numbers, hyphens only. Stored as lowercase.</p>
          </div>

          {/* Count */}
          <div>
            <label className={labelClass}>Count <span className="text-gray-400">(1–100)</span></label>
            <input
              type="number"
              min={1}
              max={100}
              value={count}
              onChange={(e) => setCount(Math.max(1, Math.min(100, parseInt(e.target.value) || 1)))}
              className={inputClass}
            />
            {count > 1 && (
              <p className="text-xs text-blue-600 mt-1">
                Bulk creation — job will be created and processed in background.
              </p>
            )}
          </div>

          {/* Clone type */}
          <div>
            <label className={labelClass}>Storage Type</label>
            <div className="grid grid-cols-2 gap-3">
              {(['dedicated_storage', 'dynamic_storage'] as const).map((type) => (
                <button
                  key={type}
                  onClick={() => setCloneType(type)}
                  className={`px-4 py-3 rounded-xl border text-left transition-all ${
                    cloneType === type
                      ? 'border-blue-500 bg-blue-50 ring-1 ring-blue-500'
                      : 'border-gray-200 hover:border-gray-300'
                  }`}
                >
                  <div className="flex items-center gap-2 mb-1">
                    <Layers className={`w-3.5 h-3.5 ${cloneType === type ? 'text-blue-600' : 'text-gray-400'}`} />
                    <span className="text-xs font-semibold text-gray-900">
                      {type === 'dedicated_storage' ? 'Dedicated' : 'Dynamic'}
                    </span>
                  </div>
                  <p className="text-xs text-gray-400">
                    {type === 'dedicated_storage'
                      ? 'Full clone — independent disk copy'
                      : 'Linked clone — shared base image'}
                  </p>
                </button>
              ))}
            </div>
          </div>

          {/* Optional overrides */}
          <div>
            <p className={labelClass}>Resource Overrides <span className="text-gray-400">(optional — must be ≥ template values)</span></p>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="text-xs text-gray-500 mb-1 block">CPU cores (min {minCpu})</label>
                <input
                  type="number"
                  min={minCpu}
                  max={128}
                  value={cpuOverride}
                  onChange={(e) => setCpuOverride(e.target.value)}
                  placeholder={String(minCpu)}
                  className={`${inputClass} ${cpuError ? 'border-red-300 focus:ring-red-500' : ''}`}
                />
                {cpuError && <p className="text-xs text-red-500 mt-1">{cpuError}</p>}
              </div>
              <div>
                <label className="text-xs text-gray-500 mb-1 block">RAM GB (min {minRam})</label>
                <input
                  type="number"
                  min={minRam}
                  max={512}
                  step={0.5}
                  value={ramOverride}
                  onChange={(e) => setRamOverride(e.target.value)}
                  placeholder={String(minRam)}
                  className={`${inputClass} ${ramError ? 'border-red-300 focus:ring-red-500' : ''}`}
                />
                {ramError && <p className="text-xs text-red-500 mt-1">{ramError}</p>}
              </div>
              <div>
                <label className="text-xs text-gray-500 mb-1 block">Disk GB (min {minDisk})</label>
                <input
                  type="number"
                  min={minDisk}
                  max={10000}
                  value={diskOverride}
                  onChange={(e) => setDiskOverride(e.target.value)}
                  placeholder={String(minDisk)}
                  className={`${inputClass} ${cloneType === 'dynamic_storage' ? 'opacity-50' : ''} ${diskError ? 'border-red-300 focus:ring-red-500' : ''}`}
                  disabled={cloneType === 'dynamic_storage'}
                />
                {diskError && <p className="text-xs text-red-500 mt-1">{diskError}</p>}
                {cloneType === 'dynamic_storage' && (
                  <p className="text-xs text-gray-400 mt-1">Not applicable for dynamic storage</p>
                )}
              </div>
            </div>
          </div>

          {/* Description */}
          <div>
            <label className={labelClass}>Description <span className="text-gray-400">(optional)</span></label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              maxLength={500}
              rows={2}
              placeholder="Optional notes about this VM…"
              className={`${inputClass} resize-none`}
            />
          </div>

          <div className="flex items-center justify-between pt-2">
            <button
              onClick={() => setStep(1)}
              className="inline-flex items-center gap-2 px-4 py-2 text-sm text-gray-600 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 transition"
            >
              <ChevronLeft className="w-4 h-4" />
              Back
            </button>
            <button
              onClick={() => setStep(3)}
              disabled={!canProceedStep2()}
              className="inline-flex items-center gap-2 px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Review
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* Step 3 — Review */}
      {step === 3 && templateDetails && selectedTemplate && (
        <div className="bg-white border border-gray-200 rounded-xl shadow-sm p-6">
          <h2 className="text-sm font-semibold text-gray-900 mb-5">Review & Create</h2>

          <div className="space-y-3 mb-6">
            {[
              { label: 'Template', value: `${selectedTemplate.name} (ID: ${selectedTemplate.vmid})` },
              { label: 'VM Name', value: count > 1 ? `${name.toLowerCase()}-1 … ${name.toLowerCase()}-${count}` : name.toLowerCase() },
              { label: 'Count', value: count === 1 ? '1 VM (async job)' : `${count} VMs (bulk job)` },
              { label: 'Storage Type', value: cloneType === 'dedicated_storage' ? 'Dedicated (full clone)' : 'Dynamic (linked clone)' },
              { label: 'Node', value: selectedTemplate.node },
              { label: 'CPU', value: `${safeCpu} vCPU` },
              { label: 'RAM', value: `${safeRam} GB` },
              { label: 'Disk', value: cloneType === 'dedicated_storage' ? `${safeDisk} GB` : 'Shared (dynamic)' },
              ...(description ? [{ label: 'Description', value: description }] : []),
            ].map(({ label, value }) => (
              <div key={label} className="flex items-start justify-between py-2 border-b border-gray-50 last:border-0">
                <span className="text-xs text-gray-500 font-medium w-32 shrink-0">{label}</span>
                <span className="text-xs text-gray-900 text-right">{value}</span>
              </div>
            ))}
          </div>

          <div className="p-3 bg-blue-50 border border-blue-100 rounded-lg mb-5">
            <p className="text-xs text-blue-700">
              {count === 1
                ? 'VM creation runs in the background. You\'ll be redirected to track progress.'
                : <><strong>Bulk creation:</strong> A job will be created and you&apos;ll be redirected to track progress. VMs are created in batches of 10 in the background.</>
              }
            </p>
          </div>

          <div className="flex items-center justify-between">
            <button
              onClick={() => setStep(2)}
              disabled={submitting}
              className="inline-flex items-center gap-2 px-4 py-2 text-sm text-gray-600 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 transition disabled:opacity-50"
            >
              <ChevronLeft className="w-4 h-4" />
              Back
            </button>
            <button
              onClick={handleSubmit}
              disabled={submitting}
              className="inline-flex items-center gap-2 px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition disabled:opacity-50 shadow-sm"
            >
              {submitting && <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />}
              {count > 1 ? `Create ${count} VMs` : 'Create VM'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
