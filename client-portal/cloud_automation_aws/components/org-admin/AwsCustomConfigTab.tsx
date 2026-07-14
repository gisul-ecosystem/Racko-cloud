'use client';

import { useCallback, useEffect, useState } from 'react';
import { Loader2, Pencil, Plus, Trash2 } from 'lucide-react';
import {
  addAwsCustomServiceToRequest,
  assignAwsCustomIamPolicy,
  assignAwsCustomIamPolicyToAll,
  createAwsCustomIamPolicy,
  createAwsCustomService,
  deleteAwsCustomIamPolicy,
  deleteAwsCustomService,
  listAwsCustomIamPolicies,
  listAwsCustomIamAssignments,
  listAwsCustomServices,
  listAwsRequestCustomServices,
  removeAwsCustomServiceFromRequest,
  revokeAwsCustomIamAssignment,
  updateAwsCustomIamPolicy,
  updateAwsCustomService,
} from '../../api/orgAdminClient';
import type {
  AwsCustomIamPolicy,
  AwsCustomIamPolicyAssignment,
  AwsCustomService,
  AwsOrgAdminUser,
} from '../../types/orgAdmin';

export function AwsCustomConfigTab({
  requestId,
  users,
}: {
  requestId: string;
  users: AwsOrgAdminUser[];
}) {
  const [policies, setPolicies] = useState<AwsCustomIamPolicy[]>([]);
  const [services, setServices] = useState<AwsCustomService[]>([]);
  const [requestServices, setRequestServices] = useState<AwsCustomService[]>([]);
  const [assignments, setAssignments] = useState<AwsCustomIamPolicyAssignment[]>([]);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [policyName, setPolicyName] = useState('');
  const [policyDescription, setPolicyDescription] = useState('');
  const [policyDocument, setPolicyDocument] = useState('{\n  "Version": "2012-10-17",\n  "Statement": []\n}');
  const [serviceName, setServiceName] = useState('');
  const [serviceDescription, setServiceDescription] = useState('');
  const [serviceCategory, setServiceCategory] = useState('Custom');
  const [servicePrice, setServicePrice] = useState('0');
  const [assignmentPolicyId, setAssignmentPolicyId] = useState('');
  const [assignmentUser, setAssignmentUser] = useState('all');

  const load = useCallback(async () => {
    try {
      const [nextPolicies, nextServices, selected, nextAssignments] = await Promise.all([
        listAwsCustomIamPolicies(),
        listAwsCustomServices(),
        listAwsRequestCustomServices(requestId),
        listAwsCustomIamAssignments(requestId),
      ]);
      setPolicies(nextPolicies);
      setServices(nextServices);
      setRequestServices(selected);
      setAssignments(nextAssignments);
    } catch (err) {
      setFeedback(err instanceof Error ? err.message : 'Failed to load custom configuration.');
    }
  }, [requestId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function act(action: () => Promise<unknown>, message: string) {
    setBusy(true);
    setFeedback(null);
    try {
      await action();
      setFeedback(message);
      await load();
    } catch (err) {
      setFeedback(err instanceof Error ? err.message : 'Action failed.');
    } finally {
      setBusy(false);
    }
  }

  async function createPolicy() {
    if (!policyName.trim()) return;
    let document: Record<string, unknown>;
    try {
      document = JSON.parse(policyDocument) as Record<string, unknown>;
    } catch {
      setFeedback('IAM policy document must be valid JSON.');
      return;
    }
    await act(
      () => createAwsCustomIamPolicy({ name: policyName.trim(), description: policyDescription.trim(), document }),
      `IAM policy "${policyName}" created.`
    );
    setPolicyName('');
    setPolicyDescription('');
  }

  async function createService() {
    if (!serviceName.trim()) return;
    await act(
      () => createAwsCustomService({
        name: serviceName.trim(),
        description: serviceDescription.trim(),
        category: serviceCategory,
        pricePerUser: Number(servicePrice) || 0,
      }),
      `Service "${serviceName}" created.`
    );
    setServiceName('');
    setServiceDescription('');
  }

  async function assignPolicy() {
    if (!assignmentPolicyId) return;
    await act(
      () =>
        assignmentUser === 'all'
          ? assignAwsCustomIamPolicyToAll(requestId, assignmentPolicyId)
          : assignAwsCustomIamPolicy(requestId, Number(assignmentUser), assignmentPolicyId),
      assignmentUser === 'all' ? 'Policy assigned to all users.' : 'Policy assigned to user.'
    );
  }

  return (
    <div className="divide-y">
      {feedback && <div className="mx-6 mt-5 rounded-lg bg-blue-50 px-4 py-3 text-sm text-blue-800">{feedback}</div>}
      <section className="space-y-4 px-6 py-5">
        <div>
          <h3 className="font-semibold text-gray-900">Custom IAM Policies</h3>
          <p className="text-sm text-gray-500">Define reusable AWS policy documents for lab users.</p>
        </div>
        <div className="grid gap-3 rounded-lg border bg-gray-50 p-4 lg:grid-cols-2">
          <div className="space-y-2">
            <input value={policyName} onChange={(e) => setPolicyName(e.target.value)} placeholder="Policy name" className="w-full rounded-lg border px-3 py-2 text-sm" />
            <input value={policyDescription} onChange={(e) => setPolicyDescription(e.target.value)} placeholder="Description" className="w-full rounded-lg border px-3 py-2 text-sm" />
          </div>
          <textarea value={policyDocument} onChange={(e) => setPolicyDocument(e.target.value)} rows={5} className="rounded-lg border px-3 py-2 font-mono text-xs" />
          <button type="button" disabled={busy} onClick={() => void createPolicy()} className="inline-flex w-fit items-center gap-1 rounded-lg bg-[#B91C1C] px-4 py-2 text-sm text-white disabled:opacity-50"><Plus className="h-4 w-4" /> Create policy</button>
        </div>
        {policies.length === 0 ? <p className="rounded-lg border border-dashed p-8 text-center text-sm text-gray-500">No custom IAM policies.</p> : policies.map((policy) => (
          <div key={policy.id} className="flex items-start justify-between gap-3 rounded-lg border p-4">
            <div><p className="font-medium text-gray-900">{policy.name}</p><p className="text-xs text-gray-500">{policy.description || 'No description'}</p><code className="mt-2 block max-w-3xl truncate text-xs text-gray-500">{JSON.stringify(policy.document)}</code></div>
            <div className="flex gap-1">
              <button type="button" disabled={busy} onClick={() => {
                const name = window.prompt('Policy name', policy.name);
                if (name) void act(() => updateAwsCustomIamPolicy(policy.id, { name }), 'Policy updated.');
              }} className="rounded border p-2 text-gray-600"><Pencil className="h-3.5 w-3.5" /></button>
              <button type="button" disabled={busy} onClick={() => window.confirm(`Delete "${policy.name}"?`) && void act(() => deleteAwsCustomIamPolicy(policy.id), 'Policy deleted.')} className="rounded border border-red-200 p-2 text-red-600"><Trash2 className="h-3.5 w-3.5" /></button>
            </div>
          </div>
        ))}
        <div className="space-y-3 rounded-lg border bg-gray-50 p-4">
          <h4 className="text-sm font-semibold text-gray-900">Assign custom policy</h4>
          <div className="flex flex-wrap gap-2">
            <select value={assignmentPolicyId} onChange={(event) => setAssignmentPolicyId(event.target.value)} className="rounded-lg border bg-white px-3 py-2 text-sm">
              <option value="">Select policy</option>
              {policies.map((policy) => <option key={policy.id} value={policy.id}>{policy.name}</option>)}
            </select>
            <select value={assignmentUser} onChange={(event) => setAssignmentUser(event.target.value)} className="rounded-lg border bg-white px-3 py-2 text-sm">
              <option value="all">All users</option>
              {users.map((user) => <option key={user.userIndex} value={user.userIndex}>{user.username}</option>)}
            </select>
            <button type="button" disabled={busy || !assignmentPolicyId} onClick={() => void assignPolicy()} className="rounded-lg bg-[#B91C1C] px-4 py-2 text-sm text-white disabled:opacity-50">Assign</button>
          </div>
          {assignments.length > 0 && (
            <div className="divide-y rounded-lg border bg-white">
              {assignments.map((assignment) => {
                const assignmentId = assignment.id || assignment._id || '';
                return (
                  <div key={assignmentId} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
                    <span>{assignment.name} · {users.find((user) => user.userIndex === assignment.userIndex)?.username || `labuser${assignment.userIndex + 1}`}</span>
                    <button type="button" disabled={busy} onClick={() => void act(() => revokeAwsCustomIamAssignment(assignmentId), 'Policy assignment revoked.')} className="text-xs font-medium text-red-700">Revoke</button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </section>
      <section className="space-y-4 px-6 py-5">
        <div><h3 className="font-semibold text-gray-900">Custom Services</h3><p className="text-sm text-gray-500">Create services and attach them to this request.</p></div>
        <div className="grid gap-2 rounded-lg border bg-gray-50 p-4 md:grid-cols-2">
          <input value={serviceName} onChange={(e) => setServiceName(e.target.value)} placeholder="Service name" className="rounded-lg border px-3 py-2 text-sm" />
          <input value={serviceDescription} onChange={(e) => setServiceDescription(e.target.value)} placeholder="Description" className="rounded-lg border px-3 py-2 text-sm" />
          <input value={serviceCategory} onChange={(e) => setServiceCategory(e.target.value)} placeholder="Category" className="rounded-lg border px-3 py-2 text-sm" />
          <input type="number" min="0" step="0.01" value={servicePrice} onChange={(e) => setServicePrice(e.target.value)} placeholder="USD/user" className="rounded-lg border px-3 py-2 text-sm" />
          <button type="button" disabled={busy} onClick={() => void createService()} className="inline-flex w-fit items-center gap-1 rounded-lg bg-[#B91C1C] px-4 py-2 text-sm text-white disabled:opacity-50">{busy && <Loader2 className="h-4 w-4 animate-spin" />} Create service</button>
        </div>
        {services.length === 0 ? <p className="rounded-lg border border-dashed p-8 text-center text-sm text-gray-500">No custom services.</p> : services.map((service) => {
          const added = requestServices.some((item) => item.id === service.id);
          return <div key={service.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-4">
            <div><p className="font-medium text-gray-900">{service.name}</p><p className="text-xs text-gray-500">{service.category} · ${service.pricePerUser}/user</p></div>
            <div className="flex gap-2">
              <button type="button" disabled={busy} onClick={() => void act(() => added ? removeAwsCustomServiceFromRequest(requestId, service.id) : addAwsCustomServiceToRequest(requestId, service.id), added ? 'Service removed from request.' : 'Service added to request.')} className={`rounded-lg px-3 py-1.5 text-xs font-medium ${added ? 'border bg-green-50 text-green-800' : 'bg-[#B91C1C] text-white'}`}>{added ? '✓ Added' : 'Add to request'}</button>
              <button type="button" disabled={busy} onClick={() => {
                const name = window.prompt('Service name', service.name);
                if (name) void act(() => updateAwsCustomService(service.id, { name }), 'Service updated.');
              }} className="rounded border p-2 text-gray-600"><Pencil className="h-3.5 w-3.5" /></button>
              <button type="button" disabled={busy} onClick={() => window.confirm(`Delete "${service.name}"?`) && void act(() => deleteAwsCustomService(service.id), 'Service deleted.')} className="rounded border border-red-200 p-2 text-red-600"><Trash2 className="h-3.5 w-3.5" /></button>
            </div>
          </div>;
        })}
      </section>
    </div>
  );
}
