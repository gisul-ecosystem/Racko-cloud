/**
 * Multer middleware for agent file uploads.
 *
 * Unlike the tenant branding upload (which has a 2MB image-only limit),
 * this middleware accepts files of any size and any MIME type because we
 * are replicating the full VM state — installers, binaries, data files, etc.
 *
 * The file is buffered in memory and then streamed to SeaweedFS by the
 * TrackerController. For very large files this means memory pressure.
 * If that becomes a concern in production, switch multer to diskStorage
 * and stream from the temp file instead.
 */

import multer from 'multer';

export const agentFileUpload = multer({
  storage: multer.memoryStorage(),
  // No fileSize limit — we replicate everything
  limits: {},
});
