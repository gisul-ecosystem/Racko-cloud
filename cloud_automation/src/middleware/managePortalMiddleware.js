const AppError = require('../utils/AppError');
const managePortalService = require('../services/managePortalService');

const getSessionToken = (req) => {
  const querySession = typeof req.query.session === 'string' ? req.query.session.trim() : '';
  const headerSession =
    typeof req.headers['x-access-session'] === 'string' ? req.headers['x-access-session'].trim() : '';
  const authorization = typeof req.headers.authorization === 'string' ? req.headers.authorization.trim() : '';
  const bearerSession = authorization.toLowerCase().startsWith('bearer ')
    ? authorization.slice(7).trim()
    : '';

  return querySession || headerSession || bearerSession;
};

const requireAdminSession = async (req, res, next) => {
  try {
    const sessionToken = getSessionToken(req);

    if (!sessionToken) {
      throw new AppError('Access session is required.', 401);
    }

    const session = await managePortalService.requireSession(sessionToken);
    const actorType = session?.actor_type || 'admin';

    if (actorType !== 'admin') {
      throw new AppError('Admin access is required for this action.', 403);
    }

    req.managePortalSession = session;
    next();
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getSessionToken,
  requireAdminSession
};
