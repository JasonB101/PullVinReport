/**
 * Exterior / vehicle paint — shared by the report header and the hero.
 *
 * Interior colours stay out. A listing feed often sends both, and painting
 * the car Ivory because the seats are Ivory is how the buyer loses the
 * Magnetite Gray that was on the same row.
 */
import type { Field } from "@/lib/report";

export const PAINT_COLOR_LABEL = "Color";

function normalizePart(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

export function isInteriorColorLabel(label: string): boolean {
  return /\binterior\b/.test(label.toLowerCase());
}

/** Exterior / vehicle paint — includes `Vehicle color`, not just `Exterior color`. */
export function isPaintColorLabel(label: string): boolean {
  const lower = label.toLowerCase();
  if (isInteriorColorLabel(lower)) return false;
  return /\bcolou?r\b/.test(lower) || /\bpaint\b/.test(lower);
}

function isPreferredPaintLabel(label: string): boolean {
  const lower = label.toLowerCase();
  return /\bvehicle\b|\bexterior\b|\bext\b|\bpaint\b|\bbody\b/.test(lower);
}

export function colorFieldValues(fields: Field[]): string[] {
  const paint = fields.filter(
    (field) => isPaintColorLabel(field.label) && field.value.trim(),
  );
  const preferred = paint.filter((field) => isPreferredPaintLabel(field.label));
  return (preferred.length > 0 ? preferred : paint).map((field) =>
    normalizePart(field.value),
  );
}

/**
 * Most frequent paint label, then the longer / more specific one.
 *
 * `Magnetite Gray` beats `Gray` on a tie; a lone richer name beats a shorter
 * generic one. Counts still win — three `Gray` rows are three `Gray` rows.
 */
export function pickColor(candidates: string[]): string {
  const counts = new Map<string, { value: string; count: number }>();
  for (const raw of candidates) {
    const value = normalizePart(raw);
    if (!value) continue;
    const key = value.toLowerCase();
    const existing = counts.get(key);
    if (existing) existing.count += 1;
    else counts.set(key, { value, count: 1 });
  }
  return (
    [...counts.values()].sort(
      (a, b) => b.count - a.count || b.value.length - a.value.length,
    )[0]?.value ?? ""
  );
}
