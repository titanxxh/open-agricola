/**
 * Pick the seasonal background variant for a given month, then apply it
 * to <body> via a CSS custom property.
 *
 * Mapping (Northern hemisphere, chronological within each season):
 *   Jan winter-2  · Feb winter-3 · Mar spring-1 · Apr spring-2
 *   May spring-3  · Jun summer-2 · Jul summer-1 · Aug summer-3
 *   Sep autumn-1  · Oct autumn-2 · Nov autumn-3 · Dec winter-1
 *
 * URL overrides (handy for screenshots / previews):
 *   ?bg=summer-1   exact variant
 *   ?bg=4          treat as month number → spring-2
 *   ?bg=none       disable monthly background (keeps CSS fallback)
 */

const MONTH_TO_VARIANT: Record<number, string> = {
  1: 'winter-2',
  2: 'winter-3',
  3: 'spring-1',
  4: 'spring-2',
  5: 'spring-3',
  6: 'summer-2',
  7: 'summer-1',
  8: 'summer-3',
  9: 'autumn-1',
  10: 'autumn-2',
  11: 'autumn-3',
  12: 'winter-1',
};

const VARIANT_RE = /^(spring|summer|autumn|winter)-[1-3]$/;

export function variantForMonth(month: number): string {
  return MONTH_TO_VARIANT[((month - 1) % 12 + 12) % 12 + 1];
}

export function resolveSeasonalVariant(date: Date = new Date()): string | null {
  const params = new URLSearchParams(window.location.search);
  const override = params.get('bg');
  if (override === 'none') return null;
  if (override) {
    if (/^\d+$/.test(override)) {
      const n = Number(override);
      if (n >= 1 && n <= 12) return variantForMonth(n);
    }
    if (VARIANT_RE.test(override)) return override;
  }
  return variantForMonth(date.getMonth() + 1);
}

export function applyMonthlyBackground(date: Date = new Date()): void {
  const variant = resolveSeasonalVariant(date);
  if (!variant) return;
  const base = import.meta.env.BASE_URL || '/';
  const url = `${base}seasons/${variant}.webp`;
  document.documentElement.style.setProperty('--bg-monthly', `url("${url}")`);
}
