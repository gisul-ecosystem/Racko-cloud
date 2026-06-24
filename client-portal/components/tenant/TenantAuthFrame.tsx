'use client';

import type { ReactNode } from 'react';
import { Loader2 } from 'lucide-react';
import { useTenantBranding } from '@/context/TenantBrandingContext';

interface TenantAuthFrameProps {
  children: ReactNode;
  eyebrow?: string;
  title: string;
  description?: string;
}

export function TenantAuthFrame({
  children,
  eyebrow = 'SIGN IN',
  title,
  description,
}: TenantAuthFrameProps) {
  const {
    logoSrc,
    heroSrc,
    accentColor,
    secondaryColor,
    portalName,
    branding,
    tenantNotFound,
    brandingError,
    loading,
  } = useTenantBranding();

  return (
    <div className="flex min-h-screen">
      {/* Left — tenant branding panel */}
      <div
        className="relative hidden overflow-hidden lg:flex lg:w-[42%] lg:max-w-xl lg:flex-col xl:max-w-2xl"
        style={{
          backgroundColor: '#0a0f1e',
          backgroundImage: heroSrc
            ? `linear-gradient(to bottom right, rgba(10,15,30,0.88), rgba(10,15,30,0.8)), url(${heroSrc})`
            : undefined,
          backgroundSize: 'cover',
          backgroundPosition: 'center',
        }}
      >
        {/* Ambient gradients */}
        <div
          className="pointer-events-none absolute -left-24 -top-24 h-80 w-80 rounded-full opacity-30 blur-3xl"
          style={{ backgroundColor: accentColor }}
        />
        <div
          className="pointer-events-none absolute -bottom-24 -right-24 h-80 w-80 rounded-full opacity-20 blur-3xl"
          style={{ backgroundColor: secondaryColor }}
        />

        {/* Decorative rings */}
        <div className="pointer-events-none absolute right-12 top-16 h-48 w-48 rounded-full border border-white/10" />
        <div className="pointer-events-none absolute right-20 top-24 h-32 w-32 rounded-full border border-white/5" />

        {/* Marketing copy */}
        <div className="relative z-10 mt-auto p-10 pb-16">
          <p className="mb-3 text-xs font-medium uppercase tracking-[0.2em] text-gray-400">
            Secure access
          </p>
          <h2 className="max-w-xs text-2xl font-bold leading-tight text-white xl:max-w-sm xl:text-3xl">
            Quiet, capable access to your team&apos;s virtual machines.
          </h2>
          <p className="mt-4 max-w-xs text-sm leading-relaxed text-gray-400 xl:max-w-sm">
            Sign in to launch your assigned workstations or, if you&apos;re an admin, manage users
            and VM assignments across your workspace.
          </p>
        </div>
      </div>

      {/* Right — form panel */}
      <div className="flex flex-1 items-center justify-center bg-[#f3f4f6] px-6 py-12">
        <div className="w-full max-w-md">
          <div className="rounded-2xl bg-white p-8 shadow-sm ring-1 ring-gray-100">
            {loading ? (
              <div className="flex justify-center py-16">
                <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
              </div>
            ) : (
              <>
                {logoSrc ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={logoSrc}
                    alt={`${portalName} logo`}
                    className="mb-6 h-10 w-auto max-w-[200px] object-contain object-left"
                  />
                ) : (
                  <p className="mb-6 text-lg font-semibold text-gray-900">{portalName}</p>
                )}

                <p className="text-xs font-medium uppercase tracking-[0.15em] text-gray-400">
                  {eyebrow}
                </p>
                <h1 className="mt-2 text-2xl font-bold text-gray-900">{title}</h1>
                {description ? (
                  <p className="mt-2 text-sm text-gray-500">{description}</p>
                ) : null}

                {(tenantNotFound || brandingError) && (
                  <div className="mt-6 rounded-xl border border-red-200 bg-red-50 px-4 py-3">
                    <p className="text-sm font-semibold text-red-800">
                      We couldn&apos;t load this workspace.
                    </p>
                    <p className="mt-0.5 text-sm text-red-700">
                      {brandingError ?? 'Tenant not found'}
                    </p>
                  </div>
                )}

                <div className="mt-6">{children}</div>
              </>
            )}
          </div>

          {branding.supportEmail && !loading ? (
            <p className="mt-4 text-center text-xs text-gray-500">
              Need help?{' '}
              <a
                href={`mailto:${branding.supportEmail}`}
                className="hover:underline"
                style={{ color: accentColor }}
              >
                {branding.supportEmail}
              </a>
            </p>
          ) : null}
        </div>
      </div>
    </div>
  );
}
