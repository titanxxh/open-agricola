import type { Locale } from '../../../shared/i18n'
import { cardText, t } from '../../../shared/i18n'
import { getCardMeta, type CardMeta } from '../../services/card-meta'

export type CardType = 'occupation' | 'minor' | 'major'

const cardNameKeyPattern =
  /^(?:occupations|minorImprovements|improvements|cards)\.([^.]+)\.name$/

const cardAnytimeKeyPattern =
  /^cards\.([^.]+)\.anytime$/

const humanizeCardId = (cardId: string): string =>
  cardId
    .replace(/_/g, ' ')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .trim()

export const getCardDisplayName = (
  locale: Locale,
  cardId: string,
  meta = getCardMeta(cardId),
): string => {
  const season = /^through-the-seasons:(winter|spring|summer|autumn)$/.exec(cardId)?.[1]
  if (season) return t(locale, `ui.seasons.${season}`)

  const name = cardText(locale, cardId, meta).name
  return name === cardId && !meta ? humanizeCardId(cardId) : name
}

export const getCardDisplayText = (
  locale: Locale,
  cardId: string,
  meta: CardMeta,
) => {
  return cardText(locale, cardId, meta)
}

export const translateCardText = (
  locale: Locale,
  key: string,
  params?: Record<string, string | number>,
): string => {
  const resolveNames = (text: string) => text.replace(
    /\{card:([^{}\s]+)\}/g,
    (_reference, cardId: string) => getCardDisplayName(locale, cardId),
  )
  const nameMatch = cardNameKeyPattern.exec(key)
  if (nameMatch) {
    return getCardDisplayName(locale, nameMatch[1])
  }

  const translated = t(locale, key, params)
  if (translated !== key) return resolveNames(translated)

  const anytimeMatch = cardAnytimeKeyPattern.exec(key)
  if (anytimeMatch) {
    const [, cardId] = anytimeMatch
    return getCardDisplayName(locale, cardId)
  }

  return resolveNames(translated)
}
