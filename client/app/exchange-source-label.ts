import { t, type Locale } from '../../shared/i18n'
import { getCardDisplayName } from '../components/common/cardText'

/** An exchange source reads as its localized card name; a major drops its printed variant suffix. */
export const exchangeSourceLabel = (locale: Locale, id: string): string => {
  if (id === '__basic__') return t(locale, 'ui.harvestFeedBasicSource')
  const improvementName = t(locale, `improvements.${id}.name`)
  if (improvementName !== `improvements.${id}.name`) return improvementName.replace(/\s*[（(].*$/, '')
  return getCardDisplayName(locale, id)
}
