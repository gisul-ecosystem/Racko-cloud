import { redirect } from 'next/navigation';

/** Legacy path — plans live under External VM Pricing. */
export default function DedicatedServerPlansRedirect() {
  redirect('/super-admin-console/external-vm-pricing/dedicated-server');
}
