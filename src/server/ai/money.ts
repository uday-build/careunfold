export function usdToCents(value: string | number | null | undefined) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = typeof value === "number" ? value : Number.parseFloat(String(value).replace(/[$,]/g, "").trim());
  if (!Number.isFinite(parsed)) return null;
  return Math.round(parsed * 100);
}
