function isUniqueOpenSessionViolation(error) {
  return (
    error?.code === '23505' &&
    String(error?.constraint || error?.message || '').includes('idx_one_open_session_per_user')
  );
}

module.exports = {
  isUniqueOpenSessionViolation
};
