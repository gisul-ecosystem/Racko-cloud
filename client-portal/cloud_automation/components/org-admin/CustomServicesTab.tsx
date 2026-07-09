'use client';

import { useCallback, useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import {
  addOrgCustomServiceToRequest,
  createOrgCustomService,
  deleteOrgCustomService,
  listOrgCustomServices,
  listOrgRequestCustomServices,
  removeOrgCustomServiceFromRequest,
} from '../../api/orgAdminClient';
import type { OrgAdminCustomService } from '../../types/orgAdmin';

const SERVICE_CATEGORIES = [
  'Custom',
  'Compute',
  'Storage & Databases',
  'Networking',
  'Security & Identity',
  'Integration & Messaging',
  'Monitoring & DevOps',
  'AI & Machine Learning',
];

interface CustomServicesTabProps {
  requestId: number;
}

type BannerState = { type: 'success' | 'error'; message: string } | null;

export function CustomServicesTab({ requestId }: CustomServicesTabProps) {
  const [allCustomServices, setAllCustomServices] = useState<OrgAdminCustomService[]>([]);
  const [requestServices, setRequestServices] = useState<OrgAdminCustomService[]>([]);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newService, setNewService] = useState({
    name: '',
    description: '',
    category: 'Custom',
    pricePerUser: 0,
    icon: 'custom',
  });
  const [loading, setLoading] = useState(false);
  const [banner, setBanner] = useState<BannerState>(null);

  const loadData = useCallback(async () => {
    try {
      const [allServices, requestServiceList] = await Promise.all([
        listOrgCustomServices(),
        listOrgRequestCustomServices(requestId),
      ]);
      setAllCustomServices(allServices);
      setRequestServices(requestServiceList);
    } catch (error) {
      console.error('Failed to load custom services:', error);
    }
  }, [requestId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const showBanner = (type: 'success' | 'error', message: string) => {
    setBanner({ type, message });
    window.setTimeout(() => setBanner(null), 4000);
  };

  const handleCreate = async () => {
    if (!newService.name.trim()) {
      showBanner('error', 'Service name is required');
      return;
    }

    setLoading(true);
    try {
      await createOrgCustomService(newService);
      showBanner('success', `Custom service "${newService.name}" created`);
      setShowCreateForm(false);
      setNewService({
        name: '',
        description: '',
        category: 'Custom',
        pricePerUser: 0,
        icon: 'custom',
      });
      await loadData();
    } catch (error) {
      showBanner('error', error instanceof Error ? error.message : 'Failed to create service');
    } finally {
      setLoading(false);
    }
  };

  const handleAddToRequest = async (serviceId: number, serviceName: string) => {
    try {
      await addOrgCustomServiceToRequest(requestId, serviceId);
      showBanner('success', `"${serviceName}" added to this request`);
      await loadData();
    } catch (error) {
      showBanner('error', error instanceof Error ? error.message : 'Failed to add service');
    }
  };

  const handleRemoveFromRequest = async (serviceId: number, serviceName: string) => {
    try {
      await removeOrgCustomServiceFromRequest(requestId, serviceId);
      showBanner('success', `"${serviceName}" removed from this request`);
      await loadData();
    } catch (error) {
      showBanner('error', error instanceof Error ? error.message : 'Failed to remove service');
    }
  };

  const isAddedToRequest = (serviceId: number) =>
    requestServices.some((service) => service.id === serviceId);

  return (
    <div className="space-y-5 px-6 py-5">
      {banner && (
        <div
          className={`rounded-lg border px-4 py-2.5 text-sm ${
            banner.type === 'success'
              ? 'border-green-200 bg-green-50 text-green-800'
              : 'border-red-200 bg-red-50 text-red-700'
          }`}
        >
          {banner.message}
        </div>
      )}

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h3 className="text-[15px] font-semibold text-gray-900">Custom Services</h3>
          <p className="mt-1 text-sm text-gray-500">
            Define custom services and add them to this lab request.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setShowCreateForm((value) => !value)}
          className="rounded-lg bg-[#B91C1C] px-4 py-2 text-sm font-medium text-white transition hover:bg-[#991B1B]"
        >
          + Create Custom Service
        </button>
      </div>

      {showCreateForm && (
        <div className="rounded-lg border border-gray-200 bg-gray-50 p-5">
          <h4 className="mb-4 text-sm font-semibold text-gray-900">Create Custom Service</h4>

          <div className="mb-3 grid gap-3 md:grid-cols-2">
            <div>
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-gray-600">
                Service name *
              </label>
              <input
                value={newService.name}
                onChange={(event) =>
                  setNewService((current) => ({ ...current, name: event.target.value }))
                }
                placeholder="e.g. Internal ML Pipeline"
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-gray-600">
                Category
              </label>
              <select
                value={newService.category}
                onChange={(event) =>
                  setNewService((current) => ({ ...current, category: event.target.value }))
                }
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
              >
                {SERVICE_CATEGORIES.map((category) => (
                  <option key={category} value={category}>
                    {category}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="mb-3">
            <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-gray-600">
              Description
            </label>
            <input
              value={newService.description}
              onChange={(event) =>
                setNewService((current) => ({ ...current, description: event.target.value }))
              }
              placeholder="What this service provides..."
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
            />
          </div>

          <div className="mb-4 w-full max-w-xs">
            <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-gray-600">
              Price per user (USD/hr)
            </label>
            <input
              type="number"
              step="0.01"
              min="0"
              value={newService.pricePerUser}
              onChange={(event) =>
                setNewService((current) => ({
                  ...current,
                  pricePerUser: parseFloat(event.target.value) || 0,
                }))
              }
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
            />
          </div>

          <div className="flex gap-2">
            <button
              type="button"
              onClick={handleCreate}
              disabled={loading}
              className="inline-flex items-center gap-2 rounded-lg bg-[#B91C1C] px-5 py-2 text-sm font-medium text-white disabled:opacity-60"
            >
              {loading && <Loader2 className="h-4 w-4 animate-spin" />}
              {loading ? 'Creating...' : 'Create Service'}
            </button>
            <button
              type="button"
              onClick={() => setShowCreateForm(false)}
              className="rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {requestServices.length > 0 && (
        <div>
          <h4 className="mb-3 text-xs font-semibold uppercase tracking-wide text-gray-500">
            Added to this request ({requestServices.length})
          </h4>
          <div className="space-y-2">
            {requestServices.map((service) => (
              <div
                key={service.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-green-200 bg-green-50 px-4 py-3"
              >
                <div>
                  <div className="text-sm font-semibold text-gray-900">✅ {service.name}</div>
                  <div className="text-xs text-gray-500">
                    {service.category} · ${service.price_per_user}/hr per user
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => handleRemoveFromRequest(service.id, service.name)}
                  className="rounded border border-red-200 bg-white px-2.5 py-1 text-xs font-medium text-[#B91C1C]"
                >
                  Remove
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      <div>
        <h4 className="mb-3 text-xs font-semibold uppercase tracking-wide text-gray-500">
          All custom services ({allCustomServices.length})
        </h4>

        {allCustomServices.length === 0 ? (
          <div className="rounded-lg border border-dashed border-gray-200 bg-gray-50 px-6 py-10 text-center text-sm text-gray-500">
            <div className="mb-2 text-2xl">🛠️</div>
            No custom services defined yet. Click &quot;Create Custom Service&quot; to add one.
          </div>
        ) : (
          <div className="space-y-2">
            {allCustomServices.map((service) => {
              const added = isAddedToRequest(service.id);
              return (
                <div
                  key={service.id}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-gray-200 bg-white px-4 py-3"
                >
                  <div>
                    <div className="text-sm font-semibold text-gray-900">{service.name}</div>
                    <div className="text-xs text-gray-500">
                      {service.category}
                      {service.description && ` · ${service.description}`}
                      {Number(service.price_per_user) > 0 && ` · $${service.price_per_user}/hr`}
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() =>
                        added
                          ? handleRemoveFromRequest(service.id, service.name)
                          : handleAddToRequest(service.id, service.name)
                      }
                      className={`rounded-lg px-3.5 py-1.5 text-xs font-medium ${
                        added
                          ? 'border border-green-200 bg-green-50 text-green-800'
                          : 'bg-[#B91C1C] text-white'
                      }`}
                    >
                      {added ? '✓ Added' : '+ Add to Request'}
                    </button>
                    <button
                      type="button"
                      onClick={async () => {
                        if (!window.confirm(`Delete "${service.name}"?`)) return;
                        await deleteOrgCustomService(service.id);
                        await loadData();
                      }}
                      className="rounded-lg border border-red-200 bg-red-50 px-2.5 py-1.5 text-xs font-medium text-[#B91C1C]"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
