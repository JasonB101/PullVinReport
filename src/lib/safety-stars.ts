/**
 * NHTSA 5-Star glyphs shared by the HTML report and the PDF.
 *
 * Helvetica has no ★, and CSS-only stars vanish in print, so both surfaces
 * draw the same filled / empty SVG path. Ratings are never invented here —
 * callers pass a 1–5 already returned by NHTSA.
 */
export const NHTSA_STAR_MAX = 5;

/** Classic 5-point star in a 24×24 viewBox. */
export const STAR_PATH =
  "M12 3.1 14.85 8.9l6.4.93-4.63 4.51 1.09 6.36L12 17.7l-5.71 3 1.09-6.36-4.63-4.51 6.4-.93L12 3.1z";

export function nhtsaStarSlots(rating: number): boolean[] {
  const filled = Math.min(
    NHTSA_STAR_MAX,
    Math.max(0, Math.round(rating)),
  );
  return Array.from({ length: NHTSA_STAR_MAX }, (_, index) => index < filled);
}

/** Numeric score grounded only in NHTSA overall (or any 1–5 already returned). */
export function nhtsaStarScore(rating: number): string {
  return `${rating}/${NHTSA_STAR_MAX}`;
}

export function nhtsaStarLabel(label: string, rating: number): string {
  return `${label} ${rating} out of ${NHTSA_STAR_MAX} stars`;
}
