'use client';

import { RequireAdminService } from '../../../components/console/RequireAdminService';

export default function CloudLabsLayout({ children }: { children: React.ReactNode }) {
  return <RequireAdminService serviceKey="cloud-labs">{children}</RequireAdminService>;
}
