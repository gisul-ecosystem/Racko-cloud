import type { MachineOS } from '../machine-manager/machine-manager.model';
import type { InstallMethod } from './software-catalog.model';

export interface CreateSoftwareCatalogDto {
  name: string;
  version: string;
  iconUrl?: string;
  supportedOS: MachineOS[];
  installMethod: InstallMethod;
  wingetId?: string;
  aptName?: string;
  brewName?: string;
  chocoName?: string;
  fileUrl?: string;
  fileName?: string;
  zipInstallScript?: string;
  installArgs?: string;
}

export interface UpdateSoftwareCatalogDto {
  name?: string;
  version?: string;
  iconUrl?: string;
  supportedOS?: MachineOS[];
  installMethod?: InstallMethod;
  wingetId?: string;
  aptName?: string;
  brewName?: string;
  chocoName?: string;
  fileUrl?: string;
  fileName?: string;
  zipInstallScript?: string;
  installArgs?: string;
}

export interface SoftwareCatalogResponse {
  _id: string;
  name: string;
  version: string;
  iconUrl?: string;
  supportedOS: MachineOS[];
  installMethod: InstallMethod;
  wingetId?: string;
  aptName?: string;
  brewName?: string;
  chocoName?: string;
  fileUrl?: string;
  fileName?: string;
  zipInstallScript?: string;
  installArgs?: string;
  uploadedBy: string;
  createdAt: string;
  updatedAt: string;
}
