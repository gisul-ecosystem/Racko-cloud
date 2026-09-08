import type { TenantTicketStatus } from '@/lib/tenantSupportApi';

const adminStatusDescriptions: Record<TenantTicketStatus, string> = {
  open: 'Waiting for a team member to pick this up.',
  tenant_handling: 'Being handled by your team.',
  platform_assigned: 'Assigned to a Racko platform agent.',
  in_progress: 'Actively being worked on.',
  resolved: 'This ticket has been resolved.',
  closed: 'This ticket is closed.',
};

export function getAuthorBadgeLabel(authorRole: string, isTenantView: boolean): string {
  if (!isTenantView) {
    if (authorRole === 'tenant_admin') return 'Admin';
    return authorRole;
  }

  switch (authorRole) {
    case 'tenant_admin':
      return 'Admin';
    case 'tenant_user':
    case 'user':
      return 'User';
    case 'support_agent':
    case 'super_admin':
    case 'admin':
    case 'platform':
      return 'Support';
    default:
      return 'Support';
  }
}

export function getTenantFacingStatus(status: string, isTenantAdmin: boolean): string {
  if (isTenantAdmin) return status.replace(/_/g, ' ');
  const map: Record<string, string> = {
    open: 'Open',
    tenant_handling: 'In Progress',
    platform_assigned: 'Pending',
    in_progress: 'Processing',
    resolved: 'Resolved',
    closed: 'Closed',
  };
  return map[status] ?? 'Pending';
}

export function getTenantFacingStatusDescription(
  status: TenantTicketStatus,
  isTenantAdmin: boolean
): string {
  if (isTenantAdmin) return adminStatusDescriptions[status];
  const map: Partial<Record<TenantTicketStatus, string>> = {
    open: 'Waiting for a team member to pick this up.',
    tenant_handling: 'Your request is being handled by our team.',
    platform_assigned: 'Our support team is reviewing your request.',
    in_progress: 'Your request is actively being worked on.',
    resolved: 'This ticket has been resolved.',
    closed: 'This ticket is closed.',
  };
  return map[status] ?? 'Our support team is reviewing your request.';
}
