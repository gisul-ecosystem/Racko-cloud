import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Public VPS API — Racko Developers',
  description: 'OAuth2 client-credentials API for Racko VPS automation.',
};

export default function DevelopersApiLayout({ children }: { children: React.ReactNode }) {
  return children;
}
