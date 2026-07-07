const AppError = require('../utils/AppError');
const { attachRackoUser } = require('./rackoUserMiddleware');

const requireSuperAdmin = (req, res, next) => {
  attachRackoUser(req, res, (err) => {
    if (err) {
      return next(err);
    }

    if (req.rackoUser.role !== 'super_admin') {
      return next(new AppError('Forbidden — super_admin only.', 403));
    }

    next();
  });
};

module.exports = {
  requireSuperAdmin
};
