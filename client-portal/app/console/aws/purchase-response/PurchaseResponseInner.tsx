'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { respondToPurchaseIntent } from '../../../../cloud_automation_aws/api/client';
import { ApiError } from '../../../../lib/apiClient';

export default function PurchaseResponseInner() {
  const searchParams = useSearchParams();
  const token = searchParams.get('token') || '';
  const response = (searchParams.get('response') || 'no').toLowerCase();
  const [status, setStatus] = useState<'loading' | 'done' | 'error'>('loading');
  const [message, setMessage] = useState('Recording your response…');

  useEffect(() => {
    let cancelled = false;

    async function run() {
      if (!token) {
        setStatus('error');
        setMessage('This purchase link is missing a token.');
        return;
      }

      try {
        await respondToPurchaseIntent(token, response === 'yes' ? 'yes' : 'no');
        if (cancelled) return;
        setStatus('done');
        setMessage(
          response === 'yes'
            ? 'Thanks — continue to the purchase form from your Yes email link.'
            : 'Thanks for letting us know. No purchase will be created for this test lab.'
        );
      } catch (err) {
        if (cancelled) return;
        setStatus('error');
        setMessage(
          err instanceof ApiError ? err.message : 'Unable to record your response right now.'
        );
      }
    }

    void run();
    return () => {
      cancelled = true;
    };
  }, [token, response]);

  return (
    <div className="mx-auto flex min-h-[60vh] max-w-lg flex-col justify-center px-4 py-16">
      <div className="rounded-xl border border-gray-200 bg-white p-8 shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-wider text-[var(--cloud-accent,#B91C1C)]">
          AWS purchase
        </p>
        <h1 className="mt-2 text-2xl font-bold text-gray-900">
          {status === 'loading'
            ? 'Please wait'
            : status === 'done'
              ? 'Response recorded'
              : 'Something went wrong'}
        </h1>
        <p className="mt-3 text-sm leading-relaxed text-gray-600">{message}</p>
        <Link
          href="/console/aws"
          className="mt-6 inline-flex rounded-lg bg-gray-900 px-4 py-2.5 text-sm font-semibold text-white"
        >
          Back to AWS console
        </Link>
      </div>
    </div>
  );
}
