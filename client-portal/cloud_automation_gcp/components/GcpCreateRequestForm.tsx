'use client';

import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  createRequest,
  getRegions,
  getServices,
  startProvision,
  type GcpCatalogService,
} from '@/cloud_automation_gcp/api/client';
import { GCP_DEFAULT_REGION } from '@/cloud_automation_gcp/constants';
import { useGcpRoutes } from '@/lib/cloudPortalRoutes';

export function GcpCreateRequestForm() {
  const router = useRouter();
  const routes = useGcpRoutes();
  const searchParams = useSearchParams();
  const projectId = searchParams?.get('projectId');

  const [services, setServices] = useState<GcpCatalogService[]>([]);
  const [regions, setRegions] = useState<Array<{ code: string; name: string }>>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [projectName, setProjectName] = useState('');
  const [customerEmail, setCustomerEmail] = useState('');
  const [accountCount, setAccountCount] = useState(5);
  const [region, setRegion] = useState(GCP_DEFAULT_REGION);
  const [selectedServiceIds, setSelectedServiceIds] = useState<string[]>([]);
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  useEffect(() => {
    void (async () => {
      const [svc, reg] = await Promise.all([getServices({ region }), getRegions()]);
      setServices(svc);
      setRegions(reg);
      if (svc.length > 0) setSelectedServiceIds([svc[0]._id]);
    })().catch(() => setError('Failed to load GCP catalog'));
  }, [region]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const selectedServices = services
        .filter((s) => selectedServiceIds.includes(s._id))
        .map((s) => ({ serviceId: s._id, serviceName: s.name, instanceType: null, pricePerDay: 0 }));

      const { requestId } = await createRequest({
        projectName,
        projectId: projectId || undefined,
        customerEmail,
        accountCount,
        region,
        startDate,
        endDate,
        selectedServices,
        idMode: accountCount <= 5 ? 'test_ids' : 'gcp_ids',
      });

      await startProvision(requestId);
      router.push(routes.requestStatus(requestId));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create request');
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="mx-auto max-w-2xl space-y-4 p-6">
      <h1 className="text-xl font-bold text-gray-900">Create GCP lab request</h1>
      {error ? <p className="text-sm text-red-600">{error}</p> : null}

      <input
        required
        placeholder="Lab / project name"
        value={projectName}
        onChange={(e) => setProjectName(e.target.value)}
        className="w-full rounded-lg border border-gray-200 px-3 py-2"
      />
      <input
        required
        type="email"
        placeholder="Customer email"
        value={customerEmail}
        onChange={(e) => setCustomerEmail(e.target.value)}
        className="w-full rounded-lg border border-gray-200 px-3 py-2"
      />
      <input
        required
        type="number"
        min={1}
        max={100}
        value={accountCount}
        onChange={(e) => setAccountCount(Number(e.target.value))}
        className="w-full rounded-lg border border-gray-200 px-3 py-2"
      />
      <select
        value={region}
        onChange={(e) => setRegion(e.target.value)}
        className="w-full rounded-lg border border-gray-200 px-3 py-2"
      >
        {regions.map((r) => (
          <option key={r.code} value={r.code}>
            {r.name}
          </option>
        ))}
      </select>
      <input
        required
        type="datetime-local"
        value={startDate}
        onChange={(e) => setStartDate(e.target.value)}
        className="w-full rounded-lg border border-gray-200 px-3 py-2"
      />
      <input
        required
        type="datetime-local"
        value={endDate}
        onChange={(e) => setEndDate(e.target.value)}
        className="w-full rounded-lg border border-gray-200 px-3 py-2"
      />

      <div className="space-y-2">
        <p className="text-sm font-semibold text-gray-700">Services</p>
        {services.map((service) => (
          <label key={service._id} className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={selectedServiceIds.includes(service._id)}
              onChange={(e) => {
                setSelectedServiceIds((prev) =>
                  e.target.checked
                    ? [...prev, service._id]
                    : prev.filter((id) => id !== service._id)
                );
              }}
            />
            {service.name}
          </label>
        ))}
      </div>

      <button
        type="submit"
        disabled={loading || selectedServiceIds.length === 0}
        className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
      >
        {loading ? 'Creating…' : 'Create & start provisioning'}
      </button>
    </form>
  );
}
