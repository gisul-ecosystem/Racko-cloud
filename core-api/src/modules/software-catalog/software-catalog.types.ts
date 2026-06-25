import type { MachineOS, InstallMethod } from './software-catalog.model';

export interface CreateSoftwareCatalogDto {
  name: string;
  version: string;
  supportedOS: MachineOS[];
  installMethod: InstallMethod;
  wingetId?: string;
  aptName?: string;
  brewName?: string;
  chocoName?: string;
  fileUrl?: string;
  fileName?: string;
  installArgs?: string;
}

export interface SoftwareCatalogResponse {
  _id: string;
  name: string;
  version: string;
  supportedOS: MachineOS[];
  installMethod: InstallMethod;
  wingetId?: string;
  aptName?: string;
  brewName?: string;
  chocoName?: string;
  fileUrl?: string;
  fileName?: string;
  installArgs?: string;
  uploadedBy: string;
  createdAt: string;
  updatedAt: string;
}
