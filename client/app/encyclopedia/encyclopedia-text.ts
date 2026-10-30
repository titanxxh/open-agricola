import type { EncyclopediaTextField, EncyclopediaTextStatus } from '../../../shared/contract/card-encyclopedia'
import { t, type Locale } from '../../../shared/i18n'
import { resolveEncyclopediaText } from '../../../shared/projections/card-encyclopedia-text'
import type { EncyclopediaItem } from './encyclopedia-item'

export type EncyclopediaFieldText = Readonly<{
  /** Card-face markup as the game shows it; empty when the field is missing in every language. */
  text: string
  status: EncyclopediaTextStatus
}>

/** Text comes from the current language pack, the same source as in-game card faces. */
export const encyclopediaFieldText = (
  { entry, document }: EncyclopediaItem,
  field: EncyclopediaTextField,
  locale: Locale,
): EncyclopediaFieldText | undefined => {
  const parts = entry.text[field]
  if (!parts) return undefined
  const status = document.locales[locale]?.[field]?.status ?? 'localized'
  if (status === 'missing') return { text: '', status }
  return { text: resolveEncyclopediaText(parts, (key, params) => t(locale, key, params)), status }
}
