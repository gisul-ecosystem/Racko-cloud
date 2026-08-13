'use client';

import Link from 'next/link';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';

export default function IndividualKycPage() {
  const { user, isLoading, isAuthenticated, logout } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (isLoading) return;
    if (!isAuthenticated || !user) {
      router.replace('/login?redirect=/onboarding/individual-kyc');
      return;
    }
    if (user.accountType !== 'b2c' || user.onboardingStatus !== 'kyc_pending') {
      router.replace(user.role === 'admin' ? '/console' : '/dashboard/user');
    }
  }, [isLoading, isAuthenticated, user, router]);

  if (isLoading || !isAuthenticated || !user) {
    return <div className="min-h-screen bg-[#0a0f1e] flex items-center justify-center text-white">Loading...</div>;
  }

  async function handleSignOut() {
    await logout();
    router.replace('/login');
  }

  return (
    <div className="min-h-screen bg-[#0a0f1e] flex items-center justify-center px-4">
      <div className="w-full max-w-2xl rounded-2xl border border-gray-800 bg-[#111827] p-8 text-white">
        <div className="mb-4 inline-flex items-center gap-2 rounded-full bg-red-950/30 px-3 py-1 text-xs font-semibold text-[#F87171]">
          B2C
          <span className="rounded-full bg-white/10 px-2 py-0.5 text-[10px]">KYC Pending</span>
        </div>
        <h1 className="text-2xl font-semibold">KYC verification is the next step</h1>
        <p className="mt-3 text-sm text-gray-300">
          Your account has been created successfully. After login, individual customers land here
          until KYC integration is completed and approved.
        </p>
        <div className="mt-6 rounded-xl border border-gray-800 bg-black/20 p-4 text-sm text-gray-300">
          KYC provider integration will be added later. For now, this page acts as the onboarding
          holding state for new B2C customers.
        </div>
        <div className="mt-6 flex gap-3">
          <Link href="/dashboard/user" className="rounded-lg bg-[#B91C1C] px-4 py-2 text-sm font-semibold text-white">
            Continue
          </Link>
          <button
            type="button"
            onClick={handleSignOut}
            className="rounded-lg border border-gray-700 px-4 py-2 text-sm text-gray-200 hover:border-gray-500 hover:text-white transition"
          >
            Back to sign in
          </button>
        </div>
      </div>
    </div>
  );
}
