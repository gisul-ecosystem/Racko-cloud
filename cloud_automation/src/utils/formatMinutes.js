/**
 * Formats a minute count as a compact duration string (e.g. "2h 15m").
 */
function formatMinutes(minutes) {
  const value = Math.max(0, Math.round(Number(minutes) || 0));

  if (value <= 0) {
    return '0m';
  }

  const hours = Math.floor(value / 60);
  const mins = value % 60;

  if (hours === 0) {
    return `${mins}m`;
  }

  if (mins === 0) {
    return `${hours}h`;
  }

  return `${hours}h ${mins}m`;
}

module.exports = {
  formatMinutes
};
