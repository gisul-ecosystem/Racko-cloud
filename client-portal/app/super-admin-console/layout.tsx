import type { Metadata } from 'next';
import SuperAdminConsoleClientLayout from './SuperAdminConsoleClientLayout';

/**
 * Super Admin is platform/control-plane — never tenant branding.
 * Always keep Racko title + favicon regardless of host (e.g. dev.racko.ai).
 */
export const metadata: Metadata = {
  title: 'Racko Super Admin',
  description: 'Infrastructure & cloud services administration.',
  icons: {
    icon: '/images/faviconRacko.png',
    shortcut: '/images/faviconRacko.png',
    apple: '/images/faviconRacko.png',
  },
};

export default function SuperAdminConsoleLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <SuperAdminConsoleClientLayout>{children}</SuperAdminConsoleClientLayout>;
}
