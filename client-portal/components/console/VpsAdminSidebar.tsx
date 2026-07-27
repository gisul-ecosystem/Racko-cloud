'use client';

import {
  Briefcase,
  Clock,
  LayoutDashboard,
  Layers,
  Plus,
  Server,
  Shield,
  UserCheck,
  Users,
} from 'lucide-react';
import { ServiceNavSidebar } from './ServiceNavSidebar';

const navLinks = [
  {
    href: '/dashboard/admin',
    label: 'Overview',
    icon: <LayoutDashboard className="h-4 w-4" />,
    exact: true,
  },
  {
    href: '/dashboard/admin/vms',
    label: 'My VMs',
    icon: <Server className="h-4 w-4" />,
  },
  {
    href: '/dashboard/admin/vms/create',
    label: 'Create VM',
    icon: <Plus className="h-4 w-4" />,
  },
  {
    href: '/dashboard/admin/jobs',
    label: 'Jobs',
    icon: <Briefcase className="h-4 w-4" />,
  },
  // TODO: Automation feature is temporarily disabled — will be re-enabled once fixed
  // {
  //   href: '/dashboard/admin/automation',
  //   label: 'Automation',
  //   icon: <Clock className="h-4 w-4" />,
  // },
  {
    href: '/dashboard/admin/templates',
    label: 'My Templates',
    icon: <Layers className="h-4 w-4" />,
  },
  {
    href: '/dashboard/admin/users',
    label: 'Users',
    icon: <Users className="h-4 w-4" />,
  },
  {
    href: '/dashboard/admin/assign-vms',
    label: 'Assign VMs',
    icon: <UserCheck className="h-4 w-4" />,
  },
  {
    href: '/dashboard/admin/assign-vms/bulk',
    label: 'Bulk Assign',
    icon: <Users className="h-4 w-4" />,
  },
  {
    href: '/dashboard/admin/vms/restricted',
    label: 'Restricted VMs',
    icon: <Shield className="h-4 w-4" />,
  },
];

interface VpsAdminSidebarProps {
  sidebarOpen: boolean;
  onCloseSidebar: () => void;
}

export function VpsAdminSidebar({ sidebarOpen, onCloseSidebar }: VpsAdminSidebarProps) {
  return (
    <ServiceNavSidebar
      sidebarOpen={sidebarOpen}
      onCloseSidebar={onCloseSidebar}
      title="VPS Hosting"
      subtitle="Virtual machines & jobs"
      links={navLinks}
      footerHref="/console"
      footerLabel="All services"
    />
  );
}
