export function buildInstanceSelectionsParam(instances) {
  if (!instances?.length) return undefined;
  return instances.map((entry) => `${entry.serviceId}:${entry.instanceType}`).join(',');
}

export function toDateTimeLocalValue(date) {
  const pad = (value) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function defaultStartDate() {
  const date = new Date();
  date.setHours(9, 0, 0, 0);
  return toDateTimeLocalValue(date);
}

export function defaultEndDate() {
  const date = new Date();
  date.setMonth(date.getMonth() + 1);
  date.setHours(9, 0, 0, 0);
  return toDateTimeLocalValue(date);
}
