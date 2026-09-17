'use client';

import {
  BarChart2,
  Shuffle,
  UserPlus,
  Users,
} from 'lucide-react';
import { ServiceTileCard } from '@/components/super-admin-console/ServiceTileCard';

const supportSections = [
  {
    id: 'dashboard',
    name: 'Dashboard',
    href: '/super-admin-console/support/dashboard',
    icon: BarChart2,
    description: 'Live ticket stats, queue state, and per-agent workload.',
  },
  {
    id: 'tickets',
    name: 'All Tickets',
    href: '/super-admin-console/support/tickets',
    icon: Users,
    description: 'View, filter, and reassign all support tickets.',
  },
  {
    id: 'agents',
    name: 'Support Agents',
    href: '/super-admin-console/support/agents',
    icon: UserPlus,
    description: 'Create and manage support_agent accounts.',
  },
  {
    id: 'queue',
    name: 'Queue Overview',
    href: '/super-admin-console/support/queue',
    icon: Shuffle,
    description: 'Round-robin distribution stats and next-agent pointer.',
  },
] as const;

export default function SuperAdminSupportPage() {
  return (
    <div className="mx-auto max-w-screen-xl space-y-8">
      <section>
        <h1 className="mb-1 text-2xl font-bold text-gray-900">Support System</h1>
        <p className="mb-5 text-sm text-gray-500">Ticket management and agent operations.</p>

        <div className="flex flex-wrap justify-center gap-6">
          {supportSections.map((section) => (
            <ServiceTileCard
              key={section.id}
              href={section.href}
              name={section.name}
              description={section.description}
              icon={section.icon}
            />
          ))}
        </div>
      </section>
    </div>
  );
}
