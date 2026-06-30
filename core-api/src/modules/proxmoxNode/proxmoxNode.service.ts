import { ProxmoxNode } from './proxmoxNode.model';
import { proxmoxClient } from '../../utils/proxmoxClient';
import type { ProxmoxNodeRaw } from '../vm/vm.types';

export class ProxmoxNodeService {

  /** List all nodes from Proxmox cluster with their online status */
  async getAvailableNodes(): Promise<Array<{ name: string; status: string; isSelected: boolean }>> {
    const res = await proxmoxClient.get<{ data: ProxmoxNodeRaw[] }>('/nodes');
    const proxmoxNodes = res.data.data;

    // Get currently selected node names from DB
    const selected = await ProxmoxNode.find().select('name').lean();
    const selectedNames = new Set(selected.map((n) => n.name));

    return proxmoxNodes.map((n) => ({
      name: n.node,
      status: n.status,
      isSelected: selectedNames.has(n.node),
    }));
  }

  /** Save selection — replaces the entire active node list */
  async saveSelection(selectedNames: string[]): Promise<void> {
    // Delete all existing and re-insert selected ones
    await ProxmoxNode.deleteMany({});
    if (selectedNames.length > 0) {
      await ProxmoxNode.insertMany(
        selectedNames.map((name) => ({ name, displayName: name, status: 'active' }))
      );
    }
  }

  /** Returns active node names — used by placement engine and template fetching */
  static async getActiveNodeNames(): Promise<string[]> {
    const nodes = await ProxmoxNode.find({ status: 'active' }).select('name').lean();
    return nodes.map((n) => n.name);
  }
}

export const proxmoxNodeService = new ProxmoxNodeService();
