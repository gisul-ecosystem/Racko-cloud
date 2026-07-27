/**
 * Limits concurrent Hyper-V provisioning jobs (in-process; one API instance).
 */

let active = 0;
const waiters: Array<() => void> = [];

export async function acquireHyperVSlot(maxConcurrent: number): Promise<() => void> {
  if (maxConcurrent < 1) maxConcurrent = 1;

  if (active < maxConcurrent) {
    active++;
    return release;
  }

  await new Promise<void>((resolve) => waiters.push(resolve));
  active++;
  return release;
}

function release(): void {
  active = Math.max(0, active - 1);
  const next = waiters.shift();
  if (next) next();
}
