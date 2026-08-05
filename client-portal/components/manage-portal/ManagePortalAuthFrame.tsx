'use client';

import type { ReactNode } from 'react';
import { Loader2 } from 'lucide-react';
import { useTenantBranding } from '@/context/TenantBrandingContext';
import { PLATFORM_CLOUD_ACCENT } from '@/lib/cloudAccent';
import { hexToRgba } from '@/lib/tenantAccentStyles';

interface ManagePortalAuthFrameProps {
  children: ReactNode;
  eyebrow?: string;
  title: string;
  description?: string;
}

/**
 * Login chrome for manage portal — tenant branding when host resolves,
 * Racko fallback on platform domains (no blocking "tenant not found").
 */
export function ManagePortalAuthFrame({
  children,
  eyebrow = 'MANAGE PORTAL',
  title,
  description,
}: ManagePortalAuthFrameProps) {
  const {
    logoSrc,
    heroSrc,
    accentColor,
    secondaryColor,
    portalName,
    branding,
    tenantNotFound,
    loading,
  } = useTenantBranding();

  const isTenant = !tenantNotFound;
  const accent = isTenant ? accentColor : PLATFORM_CLOUD_ACCENT;
  const secondary = isTenant ? secondaryColor : '#7f1d1d';
  const name = isTenant ? portalName : 'Racko Cloud';
  const showLogo = isTenant && Boolean(logoSrc);

  return (
    <div className="flex min-h-screen">
      <div
        className="relative hidden overflow-hidden lg:flex lg:w-[42%] lg:max-w-xl lg:flex-col xl:max-w-2xl"
        style={{
          backgroundColor: '#0a0f1e',
          backgroundImage: isTenant && heroSrc
            ? `linear-gradient(to bottom right, rgba(10,15,30,0.88), rgba(10,15,30,0.8)), url(${heroSrc})`
            : undefined,
          backgroundSize: 'cover',
          backgroundPosition: 'center',
        }}
      >
        <div
          className="pointer-events-none absolute -left-24 -top-24 h-80 w-80 rounded-full opacity-30 blur-3xl"
          style={{ backgroundColor: accent }}
        />
        <div
          className="pointer-events-none absolute -bottom-24 -right-24 h-80 w-80 rounded-full opacity-20 blur-3xl"
          style={{ backgroundColor: secondary }}
        />
        <div className="pointer-events-none absolute right-12 top-16 h-48 w-48 rounded-full border border-white/10" />
        <div className="pointer-events-none absolute right-20 top-24 h-32 w-32 rounded-full border border-white/5" />

        <div className="relative z-10 mt-auto p-10 pb-16">
          <p className="mb-3 text-xs font-medium uppercase tracking-[0.2em] text-gray-400">
            Lab access
          </p>
          <h2 className="max-w-xs text-2xl font-bold leading-tight text-white xl:max-w-sm xl:text-3xl">
            Manage provisioned users and launch cloud consoles securely.
          </h2>
          <p className="mt-4 max-w-xs text-sm leading-relaxed text-gray-400 xl:max-w-sm">
            Sign in with the temporary credentials from your email to review users, budgets, and
            console access for this lab.
          </p>
        </div>
      </div>

      <div className="flex flex-1 items-center justify-center bg-[#f3f4f6] px-6 py-12">
        <div className="w-full max-w-md">
          <div className="rounded-2xl bg-white p-8 shadow-sm ring-1 ring-gray-100">
            {loading ? (
              <div className="flex justify-center py-16">
                <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
              </div>
            ) : (
              <>
                {showLogo ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={logoSrc}
                    alt={`${name} logo`}
                    className="mb-6 h-10 w-auto max-w-[200px] object-contain object-left"
                  />
                ) : (
                  <div className="mb-6 flex items-center gap-3">
                    <div
                      className="flex h-10 w-10 items-center justify-center rounded-lg text-sm font-bold text-white"
                      style={{ backgroundColor: accent }}
                    >
                      {name.slice(0, 1).toUpperCase()}
                    </div>
                    <p className="text-lg font-semibold text-gray-900">{name}</p>
                  </div>
                )}

                <p className="text-xs font-medium uppercase tracking-[0.15em] text-gray-400">
                  {eyebrow}
                </p>
                <h1 className="mt-2 text-2xl font-bold text-gray-900">{title}</h1>
                {description ? (
                  <p className="mt-2 text-sm text-gray-500">{description}</p>
                ) : null}

                <div className="mt-6">{children}</div>
              </>
            )}
          </div>

          {isTenant && branding.supportEmail && !loading ? (
            <p className="mt-4 text-center text-xs text-gray-500">
              Need help?{' '}
              <a
                href={`mailto:${branding.supportEmail}`}
                className="hover:underline"
                style={{ color: accent }}
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

export function useManagePortalBrand() {
  const { logoSrc, portalName, accentColor, tenantNotFound, loading } = useTenantBranding();
  const isTenant = !tenantNotFound;
  const accent = isTenant ? accentColor : PLATFORM_CLOUD_ACCENT;
  return {
    loading,
    isTenant,
    accent,
    accentSoft: hexToRgba(accent, 0.1),
    portalName: isTenant ? portalName : 'Racko Cloud',
    logoSrc: isTenant ? logoSrc : '',
  };
}
