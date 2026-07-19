const db = require('../db/postgres');
const AppError = require('../utils/AppError');
const { sendCredentialEmailWithRetry } = require('./email/credentialEmailService');

const activeJobs = new Set();
const STALE_SENDING_JOB_MS = 5 * 60 * 1000;

const logEmailQueueEvent = (level, event, details = {}) => {
  const entry = {
    timestamp: new Date().toISOString(),
    service: 'email-queue',
    level,
    event,
    ...details
  };

  const message = JSON.stringify(entry);

  if (level === 'error') {
    console.error(message);
    return;
  }

  console.log(message);
};

const syncCredentialDeliveryStatus = async (requestId, deliveryStatus) => {
  if (!requestId) {
    return;
  }

  const sentAt = deliveryStatus === 'sent' ? new Date() : null;

  await db.query(
    `
      UPDATE credential_delivery
      SET
        delivery_status = $2,
        sent_at = COALESCE($3, sent_at)
      WHERE request_id = $1
    `,
    [requestId, deliveryStatus, sentAt]
  );
};

const syncRelatedDeliveryStatus = async (job, deliveryStatus) => {
  if (job?.related_type !== 'credential_delivery' || !job?.related_id) {
    return;
  }

  await syncCredentialDeliveryStatus(job.related_id, deliveryStatus);
};

const ensureTable = async () => {
  await db.query(`
    CREATE TABLE IF NOT EXISTS outbound_email_jobs (
      id BIGSERIAL PRIMARY KEY,
      recipient_email TEXT NOT NULL,
      subject TEXT NOT NULL,
      html TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'queued',
      attempts INTEGER NOT NULL DEFAULT 0,
      error_message TEXT,
      related_type TEXT,
      related_id TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      started_at TIMESTAMPTZ,
      completed_at TIMESTAMPTZ,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
};

const enqueueEmail = async ({
  recipientEmail,
  subject,
  html,
  relatedType = null,
  relatedId = null,
  onSuccess = null,
  onFailure = null
}) => {
  if (!recipientEmail) {
    throw new AppError('recipientEmail is required for queued email delivery.', 400);
  }

  await ensureTable();

  const result = await db.query(
    `
      INSERT INTO outbound_email_jobs (
        recipient_email,
        subject,
        html,
        status,
        related_type,
        related_id
      )
      VALUES ($1, $2, $3, 'queued', $4, $5)
      RETURNING id
    `,
    [recipientEmail, subject, html, relatedType, relatedId]
  );

  const jobId = result.rows[0]?.id;
  setImmediate(() => {
    processEmailJob(jobId, { onSuccess, onFailure }).catch((error) => {
      logEmailQueueEvent('error', 'email_job_crashed', {
        jobId,
        message: error?.message
      });
    });
  });

  return { jobId };
};

const processEmailJob = async (jobId, callbacks = {}) => {
  if (!jobId || activeJobs.has(jobId)) {
    return;
  }

  activeJobs.add(jobId);

  const client = await db.connect();

  try {
    await client.query('BEGIN');
    const result = await client.query(
      `
        SELECT id, recipient_email, subject, html, attempts, status, related_type, related_id
        FROM outbound_email_jobs
        WHERE id = $1
        FOR UPDATE
      `,
      [jobId]
    );

    const job = result.rows[0];

    if (!job) {
      await client.query('ROLLBACK');
      return;
    }

    if (['sent', 'failed'].includes(job.status)) {
      await client.query('ROLLBACK');
      return;
    }

    await client.query(
      `
        UPDATE outbound_email_jobs
        SET status = 'sending',
            attempts = attempts + 1,
            started_at = COALESCE(started_at, NOW()),
            updated_at = NOW()
        WHERE id = $1
      `,
      [jobId]
    );

    await client.query('COMMIT');

    try {
      const mailOptions = {
        to: job.recipient_email,
        subject: job.subject,
        html: job.html
      };

      if (job.related_type === 'credential_delivery' && job.related_id) {
        try {
          const { buildCredentialSpreadsheetAttachment } = require('./credentialService');
          const attachment = await buildCredentialSpreadsheetAttachment(Number(job.related_id));
          mailOptions.attachments = [attachment];
        } catch (attachmentError) {
          logEmailQueueEvent('error', 'credential_spreadsheet_attachment_failed', {
            jobId,
            requestId: job.related_id,
            message: attachmentError?.message
          });
          throw attachmentError;
        }
      }

      await sendCredentialEmailWithRetry(mailOptions);

      await db.query(
        `
          UPDATE outbound_email_jobs
          SET status = 'sent',
              completed_at = NOW(),
              updated_at = NOW(),
              error_message = NULL
          WHERE id = $1
        `,
        [jobId]
      );

      await syncRelatedDeliveryStatus(job, 'sent');

      if (typeof callbacks.onSuccess === 'function') {
        try {
          await callbacks.onSuccess(job);
        } catch (callbackError) {
          logEmailQueueEvent('error', 'email_job_callback_failed', {
            jobId,
            phase: 'success',
            message: callbackError?.message
          });
        }
      }

      return;
    } catch (error) {
      await db.query(
        `
          UPDATE outbound_email_jobs
          SET status = 'failed',
              completed_at = NOW(),
              updated_at = NOW(),
              error_message = $2
          WHERE id = $1
        `,
        [jobId, error?.message || 'Unknown email queue failure']
      );

      await syncRelatedDeliveryStatus(job, 'failed');

      if (typeof callbacks.onFailure === 'function') {
        try {
          await callbacks.onFailure(error, job);
        } catch (callbackError) {
          logEmailQueueEvent('error', 'email_job_callback_failed', {
            jobId,
            phase: 'failure',
            message: callbackError?.message
          });
        }
      }

      throw error;
    }
  } catch (error) {
    try {
      await client.query('ROLLBACK');
    } catch (rollbackError) {
      logEmailQueueEvent('error', 'email_job_rollback_failed', {
        jobId,
        message: rollbackError?.message
      });
    }

    throw error;
  } finally {
    client.release();
    activeJobs.delete(jobId);
  }
};

const resumeOutboundEmailJobs = async () => {
  await ensureTable();

  await db.query(
    `
      UPDATE outbound_email_jobs
      SET status = 'queued',
          updated_at = NOW()
      WHERE status = 'sending'
        AND updated_at < NOW() - ($1 * INTERVAL '1 millisecond')
    `,
    [STALE_SENDING_JOB_MS]
  );

  const result = await db.query(
    `
      SELECT id
      FROM outbound_email_jobs
      WHERE status = 'queued'
      ORDER BY created_at ASC
    `
  );

  for (const row of result.rows) {
    if (!activeJobs.has(row.id)) {
      setImmediate(() => {
        processEmailJob(row.id).catch((error) => {
          logEmailQueueEvent('error', 'email_job_resume_failed', {
            jobId: row.id,
            message: error?.message
          });
        });
      });
    }
  }

  logEmailQueueEvent('info', 'email_jobs_resumed', {
    queuedCount: result.rows.length
  });
};

module.exports = {
  enqueueEmail,
  processEmailJob,
  resumeOutboundEmailJobs
};
