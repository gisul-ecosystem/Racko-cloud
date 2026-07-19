import 'dotenv/config';
import mongoose from 'mongoose';
import connectDB from './config/db.js';
import Request from '../models/Request.js';
import CleanupLog from '../models/CleanupLog.js';
import HistorySnapshot from '../models/HistorySnapshot.js';

async function migrateRequest(request) {
  const requestId = request._id;
  const requestUpdates = {
    resourceCleanupAction: request.resourceCleanupAction || 'delete',
    cleanupEnabled: request.cleanupEnabled ?? Boolean(request.enableResourceCleanup),
    enableResourceCleanup: request.enableResourceCleanup ?? Boolean(request.cleanupEnabled),
  };
  await Request.updateOne({ _id: requestId }, { $set: requestUpdates });

  for (const [index, log] of (request.cleanupLogs || []).entries()) {
    const migrationKey = `${requestId}:request-cleanup:${index}`;
    await CleanupLog.updateOne(
      { migrationKey },
      {
        $setOnInsert: {
          requestId,
          action: 'delete',
          triggeredBy: 'legacy',
          status: 'success',
          totalDeleted: 0,
          results: log.results,
          ranAt: log.ranAt || log.cleanedAt || request.updatedAt || request.createdAt,
          completedAt: log.ranAt || log.cleanedAt || request.updatedAt || request.createdAt,
          migrationKey,
        },
      },
      { upsert: true }
    );
  }

  const users = request.accessType === 'identity_center'
    ? request.identityUsers || []
    : request.labRoles || [];
  for (const user of users) {
    for (const [index, log] of (user.cleanupLogs || []).entries()) {
      const migrationKey = `${requestId}:user:${user.userIndex}:cleanup:${index}`;
      await HistorySnapshot.updateOne(
        { migrationKey },
        {
          $setOnInsert: {
            requestId,
            userIndex: user.userIndex,
            event: 'user_cleanup',
            actor: 'legacy',
            summary: `Imported cleanup for labuser${Number(user.userIndex) + 1}`,
            snapshot: { results: log.results },
            createdAt: log.cleanedAt || log.ranAt || request.updatedAt || request.createdAt,
            migrationKey,
          },
        },
        { upsert: true }
      );
    }
  }
}

async function main() {
  await connectDB();
  const cursor = Request.find({}).cursor();
  let migrated = 0;
  for await (const request of cursor) {
    await migrateRequest(request);
    migrated++;
  }
  await mongoose.disconnect();
  console.log(`AWS org-admin parity migration complete (${migrated} requests)`);
}

main().catch(async (err) => {
  console.error(err);
  await mongoose.disconnect().catch(() => {});
  process.exit(1);
});
