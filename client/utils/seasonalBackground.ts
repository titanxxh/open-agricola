import type { Locale } from '../../shared/i18n';
import { publicAssetUrl } from './public-asset-url';

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
const UTC8_OFFSET_MS = 8 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;
const SOLAR_TERMS = [
  [105, '23xiaohan'],
  [120, '24dahan'],
  [204, '01lichun'],
  [219, '02yushui'],
  [305, '03jingzhe'],
  [320, '04chunfeng'],
  [404, '05qingming'],
  [420, '06guyu'],
  [505, '07lixia'],
  [521, '08xiaoman'],
  [605, '09mangzhong'],
  [621, '10xiazhi'],
  [707, '11xiaoshu'],
  [723, '12dashu'],
  [807, '13liqiu'],
  [823, '14chushu'],
  [907, '15bailu'],
  [923, '16qiufen'],
  [1008, '17hanlu'],
  [1023, '18shuangjiang'],
  [1107, '19lidong'],
  [1122, '20xiaoxue'],
  [1207, '21daxue'],
  [1222, '22dongzhi'],
] as const;

function variantForMonth(month: number): string {
  return MONTH_TO_VARIANT[((month - 1) % 12 + 12) % 12 + 1];
}

function solarTermForDate(date: Date): string {
  const utc8 = new Date(date.getTime() + UTC8_OFFSET_MS);
  const day = (utc8.getUTCMonth() + 1) * 100 + utc8.getUTCDate();
  let variant = '22dongzhi';
  for (const [start, candidate] of SOLAR_TERMS) {
    if (day < start) break;
    variant = candidate;
  }
  return variant;
}

function resolveBackgroundVariant(locale: Locale, date: Date): string | null {
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
  return locale === 'zh' ? solarTermForDate(date) : variantForMonth(date.getMonth() + 1);
}

export function applyWebsiteBackground(locale: Locale, date: Date = new Date()): void {
  const variant = resolveBackgroundVariant(locale, date);
  if (!variant) {
    document.documentElement.style.removeProperty('--bg-monthly');
    return;
  }
  const url = publicAssetUrl(`/assets/website-bg/${variant}.webp`);
  document.documentElement.style.setProperty('--bg-monthly', `url("${url}")`);
}

export function millisecondsUntilNextUtc8Midnight(date: Date = new Date()): number {
  const elapsed = ((date.getTime() + UTC8_OFFSET_MS) % DAY_MS + DAY_MS) % DAY_MS;
  return DAY_MS - elapsed;
}
