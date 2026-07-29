import { redirect } from 'next/navigation';

/** Legacy /tenant/dashboard → /console/dashboard. */
export default function LegacyTenantDashboardRedirect() {
  redirect('/console/dashboard');
}
