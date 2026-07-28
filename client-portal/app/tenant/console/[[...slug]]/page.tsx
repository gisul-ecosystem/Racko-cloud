import { redirect } from 'next/navigation';

/** Legacy path - tenant console hub is now at /console/dashboard. */
export default async function LegacyTenantConsoleRedirect({
  params,
}: {
  params: Promise<{ slug?: string[] }>;
}) {
  const { slug } = await params;
  const rest = slug?.length ? `/${slug.join('/')}` : '';
  redirect(`/console/dashboard${rest}`);
}
