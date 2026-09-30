/** Formats rupees the Indian way for audit summaries: 150000 -> ₹1,50,000 */
export function inr(amount: number): string {
  return `₹${Number(amount).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
}

/** Returns only the keys whose values differ, as { key: { from, to } }. */
export function diff(before: Record<string, any>, after: Record<string, any>, keys: string[]) {
  const changes: Record<string, { from: unknown; to: unknown }> = {};
  for (const k of keys) {
    const a = before[k] ?? null;
    const b = after[k] ?? null;
    if (String(a) !== String(b)) changes[k] = { from: a, to: b };
  }
  return changes;
}
