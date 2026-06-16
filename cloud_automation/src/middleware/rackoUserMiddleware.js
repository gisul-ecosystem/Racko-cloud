const AppError = require('../utils/AppError');

function attachRackoUser(req, _res, next) {
  const userId = String(req.headers['x-user-id'] || '').trim();
  const role = String(req.headers['x-user-role'] || '').trim().toLowerCase();

  if (!userId) {
    return next(new AppError('Authenticated Racko user context is required.', 401));
  }

  req.rackoUser = {
    userId,
    role,
    isSuperAdmin: role === 'super_admin'
  };

  next();
}

module.exports = {
  attachRackoUser
};
