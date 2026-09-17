import type { Metadata } from 'next';
import SupportAgentClientLayout from './SupportAgentClientLayout';

export const metadata: Metadata = {
  title: 'Racko Support Agent',
  description: 'Support agent ticket queue.',
  icons: {
    icon: '/images/faviconRacko.png',
    shortcut: '/images/faviconRacko.png',
    apple: '/images/faviconRacko.png',
  },
};

export default function SupportAgentLayout({ children }: { children: React.ReactNode }) {
  return <SupportAgentClientLayout>{children}</SupportAgentClientLayout>;
}
