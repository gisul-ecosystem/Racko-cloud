/**
 * Merge overlapping (or gap-adjacent) session time intervals.
 * Intervals are { start: Date|number, end: Date|number }.
 */
export function mergeSessionIntervals(intervals, gapToleranceMs = 0) {
  if (!Array.isArray(intervals) || intervals.length === 0) {
    return [];
  }

  const normalized = intervals
    .map(({ start, end }) => {
      const startMs = start instanceof Date ? start.getTime() : new Date(start).getTime();
      const endMs = end instanceof Date ? end.getTime() : new Date(end).getTime();
      return { start: startMs, end: endMs };
    })
    .filter(({ start, end }) => Number.isFinite(start) && Number.isFinite(end) && end > start)
    .sort((a, b) => a.start - b.start);

  if (!normalized.length) {
    return [];
  }

  const merged = [{ ...normalized[0] }];

  for (let index = 1; index < normalized.length; index += 1) {
    const current = normalized[index];
    const last = merged[merged.length - 1];

    if (current.start <= last.end + gapToleranceMs) {
      last.end = Math.max(last.end, current.end);
    } else {
      merged.push({ ...current });
    }
  }

  return merged;
}

export function sumMergedIntervalMinutes(mergedIntervals) {
  if (!Array.isArray(mergedIntervals) || mergedIntervals.length === 0) {
    return 0;
  }

  return mergedIntervals.reduce((total, { start, end }) => total + (end - start) / 60000, 0);
}

export function sumMergedSessionMinutes(intervals, gapToleranceMs = 0) {
  return sumMergedIntervalMinutes(mergeSessionIntervals(intervals, gapToleranceMs));
}
