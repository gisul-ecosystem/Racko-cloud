export const PROVISION_STEPS = {
  create_project: { step: 1, progress: 20, label: 'Create GCP project' },
  apply_org_policy: { step: 2, progress: 40, label: 'Apply org policies' },
  create_users: { step: 3, progress: 60, label: 'Create Cloud Identity users' },
  assign_iam: { step: 4, progress: 80, label: 'Assign IAM roles' },
  send_credentials: { step: 5, progress: 100, label: 'Send credentials email' },
};

export const GCP_LAB_PROJECT_PREFIX = process.env.GCP_LAB_PROJECT_PREFIX || 'racko-lab';
