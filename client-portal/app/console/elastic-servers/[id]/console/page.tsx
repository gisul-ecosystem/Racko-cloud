'use client';

import { ExternalVMConsoleView } from '../../../../../components/console/ExternalVMConsoleView';

export default function ElasticServerConsolePage() {
  return (
    <ExternalVMConsoleView
      backHref="/console/elastic-servers"
      disconnectHref="/console/elastic-servers"
    />
  );
}
