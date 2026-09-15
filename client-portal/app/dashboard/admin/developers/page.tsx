'use client';

import { ApiCredentialsPage } from '@/components/developers/ApiCredentialsPage';
import { platformApiCredentialsClient } from '@/lib/apiCredentialsApi';

export default function PlatformApiCredentialsPage() {
  return <ApiCredentialsPage client={platformApiCredentialsClient} />;
}
