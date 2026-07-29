import { redirect } from 'next/navigation';

/** Legacy /tenant/login → /console/login. */
export default function LegacyTenantLoginRedirect() {
  redirect('/console/login');
}
