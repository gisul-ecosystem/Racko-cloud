import { Tenant } from '../../models/tenant.model';
import { User } from '../../models/user.model';

/** An assignable owner (platform admin or tenant) for super-admin provisioning flows. */
export interface SuperAdminTargetOption {
  id: string;
  label: string;
  email?: string | null;
  username?: string | null;
  slug?: string | null;
  name?: string | null;
}

class SuperAdminTargetsService {
  /** Every platform admin and tenant, shaped for an owner picker. */
  async listTargetOptions(): Promise<{
    admins: SuperAdminTargetOption[];
    tenants: SuperAdminTargetOption[];
  }> {
    const [admins, tenants] = await Promise.all([
      User.find({ role: 'admin' })
        .select('_id email username')
        .sort({ email: 1 })
        .lean(),
      Tenant.find({})
        .select('_id name slug')
        .sort({ name: 1, slug: 1 })
        .lean(),
    ]);

    return {
      admins: admins.map((admin) => ({
        id: admin._id.toString(),
        label: admin.username ? `${admin.username} (${admin.email})` : admin.email,
        email: admin.email,
        username: admin.username ?? null,
      })),
      tenants: tenants.map((tenant) => ({
        id: tenant._id.toString(),
        label: `${tenant.name} (${tenant.slug})`,
        name: tenant.name,
        slug: tenant.slug,
      })),
    };
  }
}

export const superAdminTargetsService = new SuperAdminTargetsService();
