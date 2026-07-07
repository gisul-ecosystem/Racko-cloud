import {
  fetchManagePortalConsoleLaunch,
  ManagePortalError,
} from '../api/managePortalClient';

export async function launchAzureConsole(params: {
  requestId: number;
  userId: number;
  sessionToken: string;
}): Promise<{ message: string }> {
  const launch = await fetchManagePortalConsoleLaunch(params);

  let copiedPassword = false;
  if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(launch.temporaryPassword);
      copiedPassword = true;
    } catch {
      copiedPassword = false;
    }
  }

  window.open(launch.signInUrl, '_blank', 'noopener,noreferrer');

  if (copiedPassword) {
    return {
      message: `Opening Azure sign-in for ${launch.userPrincipalName}. Password copied — paste it on the Microsoft login page${
        launch.resourceGroup ? `, then open resource group ${launch.resourceGroup} in Azure Portal.` : '.'
      }`,
    };
  }

  return {
    message: `Opening Azure sign-in for ${launch.userPrincipalName}. Use password ${launch.temporaryPassword} on the Microsoft login page${
      launch.resourceGroup ? `, then open resource group ${launch.resourceGroup} in Azure Portal.` : '.'
    }`,
  };
}

export function getAzureConsoleLaunchErrorMessage(error: unknown): string {
  if (error instanceof ManagePortalError) {
    return error.message;
  }

  return 'Unable to open the Azure console. Please try again.';
}
