import { pool } from '../config/db.js';
import { getLabTemplateById } from './labTemplateService.js';

export async function createLabEnrollment({
  templateId,
  learnerEmail,
  accountCount,
  selectedInstances,
  projectName,
  startDate,
  endDate,
  azureRequestId,
}) {
  const lab = await getLabTemplateById(templateId);
  if (!lab) {
    const error = new Error('Lab template not found.');
    error.statusCode = 404;
    throw error;
  }

  const spendCap = lab.cost.budgetCap;
  const instancesJson = JSON.stringify(selectedInstances || []);
  const requestId =
    azureRequestId != null && Number.isFinite(Number(azureRequestId))
      ? Number(azureRequestId)
      : null;

  if (lab.kind === 'fabric') {
    const result = await pool.query(
      `INSERT INTO fabric_enrollments (
         learner_id,
         template_id,
         status,
         started_at,
         expires_at,
         spend_cap_usd,
         learner_email,
         project_name,
         account_count,
         selected_instances,
         azure_request_id
       ) VALUES (
         gen_random_uuid(),
         $1,
         'provisioning',
         $2::timestamptz,
         $3::timestamptz,
         $4,
         $5,
         $6,
         $7,
         $8::jsonb,
         $9
       )
       RETURNING id, status, created_at, azure_request_id`,
      [
        templateId,
        startDate || null,
        endDate || null,
        spendCap,
        learnerEmail,
        projectName || null,
        accountCount,
        instancesJson,
        requestId,
      ]
    );

    return {
      enrollmentId: result.rows[0].id,
      kind: 'fabric',
      status: result.rows[0].status,
      lab,
      learnerEmail,
      accountCount,
      selectedInstances,
      projectName,
      permissions: lab.permissions,
      azureRequestId: result.rows[0].azure_request_id,
      createdAt: result.rows[0].created_at,
    };
  }

  const result = await pool.query(
    `INSERT INTO enrollments (
       learner_id,
       template_id,
       status,
       started_at,
       expires_at,
       spend_cap,
       learner_email,
       project_name,
       account_count,
       selected_instances,
       azure_request_id
     ) VALUES (
       gen_random_uuid(),
       $1,
       'provisioning',
       $2::timestamptz,
       $3::timestamptz,
       $4,
       $5,
       $6,
       $7,
       $8::jsonb,
       $9
     )
     RETURNING id, status, created_at, azure_request_id`,
    [
      templateId,
      startDate || null,
      endDate || null,
      spendCap,
      learnerEmail,
      projectName || null,
      accountCount,
      instancesJson,
      requestId,
    ]
  );

  return {
    enrollmentId: result.rows[0].id,
    kind: 'azure',
    status: result.rows[0].status,
    lab,
    learnerEmail,
    accountCount,
    selectedInstances,
    projectName,
    permissions: lab.permissions,
    azureRequestId: result.rows[0].azure_request_id,
    createdAt: result.rows[0].created_at,
  };
}
