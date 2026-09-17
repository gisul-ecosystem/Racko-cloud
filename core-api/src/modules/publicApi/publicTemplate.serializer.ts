import type { ProxmoxTemplate } from '../vm/vm.types';

/** Public template row — `templateId` is the Proxmox template vmid used by POST /vms `templateId`. */
export interface PublicVmTemplate {
  templateId: number;
  name: string;
  defaultCpuCores: number;
  defaultMemoryGb: number;
  defaultDiskGb: number;
  isCustom: boolean;
}

export function publicTemplateFromProxmox(template: ProxmoxTemplate): PublicVmTemplate {
  return {
    templateId: template.vmid,
    name: template.name,
    defaultCpuCores: template.cpu,
    defaultMemoryGb: Math.round((template.memory / 1024 ** 3) * 100) / 100,
    defaultDiskGb: Math.max(1, Math.round(template.maxdisk / 1024 ** 3)),
    isCustom: template.isCustom ?? false,
  };
}
