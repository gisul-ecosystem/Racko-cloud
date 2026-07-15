'use client';

import { ExternalVMConsoleView } from '../../../../../../components/console/ExternalVMConsoleView';
import { fetchExternalVM, getExternalVMConsole } from '../../../../../../lib/externalVmApi';

export default function UserExternalServerConsolePage() {
  return (
    <ExternalVMConsoleView
      backHref="/dashboard/user"
      disconnectHref="/dashboard/user"
      fetchVm={fetchExternalVM}
      openConsole={getExternalVMConsole}
    />
  );
}
