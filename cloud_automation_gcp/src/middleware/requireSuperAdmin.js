export function requireSuperAdmin(req, res, next) {
  const role = String(req.headers['x-user-role'] || '')
    .trim()
    .toLowerCase();

  if (role !== 'super_admin') {
    return res.status(403).json({
      success: false,
      message: 'Forbidden — super_admin only.',
    });
  }

  next();
}
