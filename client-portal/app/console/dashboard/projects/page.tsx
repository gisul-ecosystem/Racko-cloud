'use client';

import { ProjectsListView } from '@/components/console/ProjectsListView';
import { useTenantBranding } from '@/context/TenantBrandingContext';

export default function TenantProjectsListPage() {
  const { accentColor } = useTenantBranding();
  return <ProjectsListView portal="tenant" accentColor={accentColor} />;
}
