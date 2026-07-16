'use client';

import { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Shield } from 'lucide-react';
import {
  fetchAwsManagePortalData,
  loginAwsManagePortal,
  syncAwsRequestSpend,
} from '../../../cloud_automation_aws/api/managePortalClient';
import {
  clearAwsManagePortalSession,
  loadAwsManagePortalSession,
  saveAwsManagePortalSession,
} from '../../../cloud_automation_aws/utils/awsManagePortalSession';
import AwsUserAccountView from './components/AwsUserAccountView';
import InfoCards from './components/InfoCards';
import ManagePortalLogin from './components/ManagePortalLogin';
import PortalHeader from './components/PortalHeader';
import UsersTable from './components/UsersTable';

function AwsManagePortalContent() {
  const searchParams = useSearchParams();
  const urlToken = searchParams.get('token')?.trim() || null;

  const [session, setSession] = useState(null);
  const [bootstrapping, setBootstrapping] = useState(true);
  const [loginLoading, setLoginLoading] = useState(false);
  const [loginError, setLoginError] = useState(null);
  const [sessionExpired, setSessionExpired] = useState(false);

  const [portalData, setPortalData] = useState(null);
  const [dataLoading, setDataLoading] = useState(false);
  const [dataError, setDataError] = useState(null);
  const [feedback, setFeedback] = useState(null);

  useEffect(() => {
    setSession(loadAwsManagePortalSession());
    setBootstrapping(false);
  }, []);

  const loadPortalData = useCallback(async (activeSession, syncSpend = false) => {
    if (!activeSession) return;

    setDataLoading(true);
    setDataError(null);

    try {
      if (syncSpend && activeSession.role !== 'user') {
        try {
          await syncAwsRequestSpend(activeSession.requestId, activeSession.jwtToken);
        } catch {
          // Spend sync is best-effort; still load portal data.
        }
      }

      const data = await fetchAwsManagePortalData(
        activeSession.requestId,
        activeSession.jwtToken
      );
      setPortalData(data);
    } catch (err) {
      if (err.status === 401) {
        clearAwsManagePortalSession();
        setSession(null);
        setSessionExpired(true);
        setLoginError('Session expired. Please sign in again.');
      } else {
        setDataError(err.message || 'Failed to load lab users.');
      }
    } finally {
      setDataLoading(false);
    }
  }, []);

  useEffect(() => {
    if (session) {
      void loadPortalData(session, true);
    } else {
      setPortalData(null);
    }
  }, [session, loadPortalData]);

  const handleLogin = useCallback(
    async (credentials) => {
      if (!urlToken) return;

      setLoginError(null);
      setSessionExpired(false);
      setLoginLoading(true);

      try {
        const result = await loginAwsManagePortal({ token: urlToken, ...credentials });
        const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
        const nextSession = {
          jwtToken: result.jwt_token,
          requestId: String(result.requestId),
          customerEmail: result.customerEmail,
          expiresAt,
          role: result.role === 'user' ? 'user' : 'admin',
          userIndex: result.userIndex ?? null,
          username: result.username || credentials.username,
        };

        saveAwsManagePortalSession(nextSession);
        setSession(nextSession);

        if (typeof window !== 'undefined') {
          const nextUrl = new URL(window.location.href);
          nextUrl.searchParams.delete('token');
          window.history.replaceState({}, '', nextUrl.pathname + nextUrl.search);
        }
      } catch (err) {
        setLoginError(err.message || 'Unable to sign in.');
      } finally {
        setLoginLoading(false);
      }
    },
    [urlToken]
  );

  const handleLogout = useCallback(() => {
    clearAwsManagePortalSession();
    setSession(null);
    setPortalData(null);
    setFeedback(null);
    setSessionExpired(false);
  }, []);

  const handleRefresh = useCallback(() => {
    setFeedback(null);
    void loadPortalData(session, true);
  }, [session, loadPortalData]);

  const isUser = session?.role === 'user';
  const currentUser = useMemo(() => {
    if (!isUser || !portalData?.consoleUrls?.length) return null;
    return (
      portalData.consoleUrls.find((user) => Number(user.userIndex) === Number(session.userIndex)) ||
      portalData.consoleUrls[0]
    );
  }, [isUser, portalData, session?.userIndex]);

  const signedInAs = isUser
    ? session?.username || `labuser${Number(session?.userIndex) + 1}`
    : 'Admin';

  const portalTitle = isUser ? 'My Account' : 'Manage Provisioned Users';
  const portalDescription = isUser
    ? 'View your provisioned AWS account status, session activity, and open the AWS console.'
    : 'Review provisioned AWS users, launch console access, and manage budgets and cleanup.';

  if (bootstrapping) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-gray-200 border-t-[#B91C1C]" />
      </div>
    );
  }

  const showPortal = Boolean(session);

  if (!showPortal) {
    return (
      <div className="min-h-screen bg-gray-50">
        <header className="border-b border-gray-200 bg-white">
          <div className="mx-auto flex max-w-screen-xl items-center gap-3 px-4 py-4 sm:px-6 lg:px-8">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-red-50 text-[#B91C1C]">
              <Shield className="h-5 w-5" />
            </div>
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-gray-500">Racko Cloud</p>
              <h1 className="text-lg font-bold text-gray-900">Secure Access Portal</h1>
            </div>
          </div>
        </header>

        <main className="mx-auto max-w-screen-xl px-4 py-8 sm:px-6 lg:px-8">
          <div className="space-y-8">
            <div className="mx-auto max-w-lg text-center">
              <h2 className="text-2xl font-bold text-gray-900">Manage Portal</h2>
              <p className="mt-2 text-sm text-gray-500">
                Admins sign in with the temporary credentials from your email. Provisioned users sign in
                with your IAM username and temporary password.
              </p>
            </div>
            <ManagePortalLogin
              token={urlToken}
              loading={loginLoading}
              error={loginError}
              sessionExpired={sessionExpired}
              onSubmit={handleLogin}
            />
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <PortalHeader
        onRefresh={handleRefresh}
        onSignOut={handleLogout}
        refreshing={dataLoading}
      />

      <main className="mx-auto max-w-screen-xl space-y-6 px-4 py-8 sm:px-6 lg:px-8">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">{portalTitle}</h2>
          <p className="mt-1 text-sm text-gray-500">{portalDescription}</p>
        </div>

        <InfoCards
          signedInAs={signedInAs}
          requestId={session.requestId}
          awsAccountId={portalData?.awsAccountId}
          customerEmail={portalData?.customerEmail || session.customerEmail}
          expiresAt={portalData?.endDate}
          startsAt={portalData?.startDate}
        />

        {portalData?.servicePeriod && !portalData.servicePeriod.allowed ? (
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            {portalData.servicePeriod.message}
          </div>
        ) : null}

        {(feedback || dataError) && (
          <div
            className={`rounded-lg border px-4 py-3 text-sm ${
              dataError
                ? 'border-red-200 bg-red-50 text-red-700'
                : 'border-green-200 bg-green-50 text-green-700'
            }`}
          >
            {dataError || feedback}
          </div>
        )}

        {isUser ? (
          dataLoading || !currentUser ? (
            <div className="flex items-center justify-center rounded-xl border border-gray-200 bg-white px-6 py-16 shadow-sm">
              <div className="h-8 w-8 animate-spin rounded-full border-2 border-gray-200 border-t-[#B91C1C]" />
            </div>
          ) : (
            <AwsUserAccountView
              user={currentUser}
              requestId={session.requestId}
              jwtToken={session.jwtToken}
              portalData={portalData}
              onFeedback={setFeedback}
            />
          )
        ) : (
          portalData && (
            <UsersTable
              requestId={session.requestId}
              jwtToken={session.jwtToken}
              portalData={portalData}
              loading={dataLoading}
              onRefresh={() => void loadPortalData(session, true)}
              onFeedback={setFeedback}
            />
          )
        )}
      </main>
    </div>
  );
}

function ManageUsersFallback() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50">
      <div className="h-8 w-8 animate-spin rounded-full border-2 border-gray-200 border-t-[#B91C1C]" />
    </div>
  );
}

export default function AwsManageUsersPage() {
  return (
    <Suspense fallback={<ManageUsersFallback />}>
      <AwsManagePortalContent />
    </Suspense>
  );
}
