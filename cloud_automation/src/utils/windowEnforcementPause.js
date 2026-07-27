const isWindowEnforcementPaused = (row) => {
  if (!row?.window_enforcement_paused_until) {
    return false;
  }

  return new Date(row.window_enforcement_paused_until).getTime() > Date.now();
};

module.exports = {
  isWindowEnforcementPaused
};
