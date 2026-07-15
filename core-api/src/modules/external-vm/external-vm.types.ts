import type { ExternalVMProtocol } from './external-vm.model';

/** Payload to create a single external VM. */
export interface CreateExternalVMDto {
  name: string;
  ipAddress: string;
  protocol: ExternalVMProtocol;
  username?: string;
  password: string;
}

/** API-facing external VM shape. Password is returned DECRYPTED. */
export interface ExternalVMResponse {
  _id: string;
  name: string;
  ipAddress: string;
  protocol: ExternalVMProtocol;
  username: string;
  password: string;
  adminId?: string;
  tenantId?: string;
  createdAt: string;
  updatedAt: string;
}

/** Guacamole console session for an external VM (mirrors the VPS console shape). */
export interface ExternalVMConsoleSession {
  protocol: ExternalVMProtocol;
  clientUrl: string;
  connectionId: string;
}
