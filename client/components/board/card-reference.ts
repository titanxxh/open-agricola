import type { Locale } from '../../../shared/i18n'
import { t } from '../../../shared/i18n'
import { getCardMeta } from '../../services/card-meta'
import { getAnyCardDisplayName, getCardDisplayName, type CardType } from '../common/cardText'

export type CardRef = { id: string; type: CardType; name: string }

export const resolveCardRef = (locale: Locale, id: string): CardRef | null => {
  const meta = getCardMeta(id)
  const type = meta?.type === 'playerAction' ? meta.playerActionCardType ?? 'occupation' : meta?.type
  if (meta && type) {
    return { id, type, name: getCardDisplayName(locale, type, id, meta).replace(/\s*[（(].*$/, '') }
  }

  const tryKey = (prefix: string, type: CardRef['type']) => {
    const name = t(locale, `${prefix}.${id}.name`)
    if (!name.includes('.name')) return { id, type, name: name.replace(/\s*[（(].*$/, '') }
    return null
  }
  const translated =
    tryKey('improvements', 'major') ??
    tryKey('minorImprovements', 'minor') ??
    tryKey('occupations', 'occupation')
  if (translated) return translated

  if (!meta) return null
  return { id, type: 'occupation', name: getAnyCardDisplayName(locale, id).replace(/\s*[（(].*$/, '') }
}

export const resolveCardDisplayName = (locale: Locale, id: string) =>
  resolveCardRef(locale, id)?.name ?? getAnyCardDisplayName(locale, id)
