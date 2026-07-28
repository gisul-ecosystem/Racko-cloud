import { redirect } from 'next/navigation';

/** Legacy /tenant root → tenant workspace hub. */
export default function LegacyTenantRootRedirect() {
  redirect('/console/dashboard');
}
