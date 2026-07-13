const AppError = require('../utils/AppError');
const db = require('../db/postgres');

/**
 * Ensures req.params.id refers to a request owned by the authenticated Racko user.
 * Super admins bypass. Missing/unauthorized requests return 404 (no existence leak).
 */
async function requireOwnedRequest(req, _res, next) {
  try {
    if (!req.rackoUser?.userId) {
      return next(new AppError('Authenticated Racko user context is required.', 401));
    }

    if (req.rackoUser.isSuperAdmin) {
      return next();
    }

    const requestId = String(req.params.id ?? '').trim();
    if (!/^\d+$/.test(requestId)) {
      return next(new AppError('Request id must be a positive integer.', 400));
    }

    const result = await db.query(
      `
      SELECT racko_user_id
      FROM requests
      WHERE id = $1
      `,
      [Number(requestId)]
    );

    if (!result.rows.length) {
      return next(new AppError('Request not found.', 404));
    }

    const ownerId = result.rows[0].racko_user_id;
    if (!ownerId || String(ownerId) !== String(req.rackoUser.userId)) {
      return next(new AppError('Request not found.', 404));
    }

    next();
  } catch (error) {
    next(error);
  }
}

module.exports = {
  requireOwnedRequest,
};
