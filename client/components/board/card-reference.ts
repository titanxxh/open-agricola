import type { Locale } from '../../../shared/i18n'
import { t } from '../../../shared/i18n'
import { getCardMeta } from '../../services/card-meta'
import type { CardType } from '../common/PlayerCard'
import { getAnyCardDisplayName } from '../common/cardText'

export type CardRef = { id: string; type: CardType; name: string }

export const resolveCardRef = (locale: Locale, id: string): CardRef | null => {
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

  const meta = getCardMeta(id)
  if (!meta) return null

  const type: CardRef['type'] =
    meta.type === 'major'
      ? 'major'
      : meta.type === 'minor'
        ? 'minor'
        : meta.type === 'occupation'
          ? 'occupation'
          : t(locale, `minorImprovements.${id}.name`) !== `minorImprovements.${id}.name`
            ? 'minor'
            : 'occupation'

  return { id, type, name: meta.name.replace(/\s*[（(].*$/, '') }
}

export const resolveCardDisplayName = (locale: Locale, id: string) =>
  resolveCardRef(locale, id)?.name ?? getAnyCardDisplayName(locale, id)
