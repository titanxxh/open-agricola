import type { Locale } from '../../../shared/i18n'
import { t } from '../../../shared/i18n'
import { getCardMeta } from '../../services/card-meta'
import type { CardType } from '../common/PlayerCard'

export type CardRef = { id: string; type: CardType; name: string }

const humanizeCardId = (id: string): string =>
  id
    .replace(/_/g, ' ')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .trim()

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
  resolveCardRef(locale, id)?.name ?? humanizeCardId(id)
