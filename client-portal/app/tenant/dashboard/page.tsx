import { redirect } from 'next/navigation';

export default function TenantDashboardIndexPage() {
  redirect('/tenant/dashboard/wallet');
}
