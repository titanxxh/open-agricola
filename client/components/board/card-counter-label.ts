import { t, type Locale } from '../../../shared/i18n'

/**
 * A played card's non-resource counter reads as the label of the key the card declares
 * (`ui.cardCounters.<key>`); an undeclared key still reads as a count, never as a raw key.
 */
export const cardCounterLabel = (locale: Locale, key: string, count: number): string => {
  const labelKey = `ui.cardCounters.${key}`
  const label = t(locale, labelKey, { count })
  return label === labelKey ? t(locale, 'ui.cardCounters.default', { count }) : label
}
