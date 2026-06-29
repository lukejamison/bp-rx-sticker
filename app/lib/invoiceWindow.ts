/** Widen invoice lookup on Sun/Mon so Fri/Sat receipts still match. */
export function getEffectiveInvoiceHours(configuredHours: number): number {
  const day = new Date().getDay();
  if (day === 0 || day === 1) {
    return Math.max(configuredHours, 72);
  }
  return configuredHours;
}
