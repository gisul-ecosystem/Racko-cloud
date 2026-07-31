import { redirect } from 'next/navigation';

/** Legacy /tenant/dashboard/* → /console/dashboard/*. */
export default async function LegacyTenantDashboardCatchAll({
  params,
}: {
  params: Promise<{ slug: string[] }>;
}) {
  const { slug } = await params;
  redirect(`/console/dashboard/${slug.join('/')}`);
}
