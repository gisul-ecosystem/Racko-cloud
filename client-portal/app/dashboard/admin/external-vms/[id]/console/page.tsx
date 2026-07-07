'use client';

import { ExternalVMConsoleView } from '../../../../../../components/console/ExternalVMConsoleView';

export default function AdminExternalVMConsolePage() {
  return (
    <ExternalVMConsoleView
      backHref="/console/elastic-servers"
      disconnectHref="/console/elastic-servers"
    />
  );
}
