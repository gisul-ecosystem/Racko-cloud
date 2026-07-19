'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { ApiError } from '@/lib/apiClient';
import {
  fetchDedicatedPlans,
  submitDedicatedServerRequest,
  type IDedicatedPlan,
} from '@/lib/dedicatedServerApi';
import { ErrorState } from '@/components/dashboard/ErrorState';

function formatInr(n: number) {
  return `₹ ${n.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
}

export default function DedicatedRequestPage() {
  const router = useRouter();
  const [plans, setPlans] = useState<IDedicatedPlan[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchDedicatedPlans();
      setPlans(data);
      if (data.length && !selectedId) setSelectedId(data[0]._id);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to load plans.');
    } finally {
      setLoading(false);
    }
  }, [selectedId]);

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedId) return;
    setSubmitting(true);
    setError(null);
    try {
      await submitDedicatedServerRequest({
        planId: selectedId,
        notes: notes.trim() || undefined,
      });
      router.push('/console/dedicated-server/my-servers');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Request failed.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="max-w-screen-lg">
      <h1 className="text-2xl font-bold text-gray-900">Request Dedicated Server</h1>
      <p className="mt-1 text-sm text-gray-500">
        Choose a plan. Your wallet is charged the monthly price; super-admin attaches the machine.
      </p>

      {error && !loading && (
        <div className="mt-4">
          <ErrorState message={error} onRetry={load} />
        </div>
      )}

      {loading ? (
        <div className="mt-10 flex justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-[#B91C1C]" />
        </div>
      ) : plans.length === 0 ? (
        <p className="mt-8 text-sm text-gray-500">Coming soon</p>
      ) : (
        <form onSubmit={(e) => void handleSubmit(e)} className="mt-6 space-y-6">
          <div className="grid gap-3 sm:grid-cols-2">
            {plans.map((plan) => {
              const selected = selectedId === plan._id;
              return (
                <button
                  key={plan._id}
                  type="button"
                  onClick={() => setSelectedId(plan._id)}
                  className={`rounded-xl border p-4 text-left transition ${
                    selected
                      ? 'border-[#B91C1C] bg-red-50/50 ring-1 ring-[#B91C1C]'
                      : 'border-gray-200 bg-white hover:border-gray-300'
                  }`}
                >
                  <p className="font-semibold text-gray-900">{plan.name}</p>
                  {plan.description ? (
                    <p className="mt-1 text-xs text-gray-500">{plan.description}</p>
                  ) : null}
                  <p className="mt-2 text-xs text-gray-600">
                    {plan.cpu} · {plan.ram} · {plan.disk}
                    {plan.location ? ` · ${plan.location}` : ''}
                  </p>
                  <p className="mt-2 font-mono text-sm font-semibold text-gray-900">
                    {formatInr(plan.monthlyPrice)}
                    <span className="font-normal text-gray-500"> / mo</span>
                  </p>
                </button>
              );
            })}
          </div>

          <div>
            <label className="text-xs font-medium text-gray-600">Notes (optional)</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
              placeholder="Any special requirements…"
            />
          </div>

          <button
            type="submit"
            disabled={!selectedId || submitting}
            className="inline-flex items-center gap-2 rounded-lg bg-[#B91C1C] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#a01717] disabled:opacity-50"
          >
            {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Submit request
          </button>
        </form>
      )}
    </div>
  );
}
