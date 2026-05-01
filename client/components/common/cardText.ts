import type { Locale } from '../../../shared/i18n'
import { t } from '../../../shared/i18n'
import { getCardMeta } from '../../services/card-meta'

type CardType = 'occupation' | 'minor' | 'major'

const cardNameKeyPattern =
  /^(occupations|minorImprovements|improvements)\.([^.]+)\.name$/

const cardAnytimeKeyPattern =
  /^cards\.([^.]+)\.anytime$/

const humanizeCardId = (cardId: string): string =>
  cardId
    .replace(/_/g, ' ')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .trim()

const inferCardType = (cardId: string, locale?: Locale): CardType | null => {
  const meta = getCardMeta(cardId)
  if (!meta) return null
  switch (meta.type) {
    case 'occupation':
      return 'occupation'
    case 'minor':
      return 'minor'
    case 'major':
      return 'major'
    case 'playerAction': {
      // PlayerActionCards can live in either the occupation or minor catalog
      // array depending on history. Probe i18n to decide which prefix has a
      // translation; default to occupation if neither matches.
      if (locale) {
        const occKey = `occupations.${cardId}.name`
        if (t(locale, occKey) !== occKey) return 'occupation'
        const minorKey = `minorImprovements.${cardId}.name`
        if (t(locale, minorKey) !== minorKey) return 'minor'
      }
      return 'occupation'
    }
    default:
      return null
  }
}

export const getAnyCardDisplayName = (
  locale: Locale,
  cardId: string,
): string => getCardDisplayName(locale, inferCardType(cardId, locale), cardId)

export const getCardDisplayName = (
  locale: Locale,
  cardType: CardType | null,
  cardId: string,
): string => {
  if (cardType === 'occupation') {
    const key = `occupations.${cardId}.name`
    const translated = t(locale, key)
    if (translated !== key) return translated
    const meta = getCardMeta(cardId)
    return meta?.name || humanizeCardId(cardId)
  }
  if (cardType === 'minor') {
    const key = `minorImprovements.${cardId}.name`
    const translated = t(locale, key)
    if (translated !== key) return translated
    const meta = getCardMeta(cardId)
    return meta?.name || humanizeCardId(cardId)
  }
  if (cardType === 'major') {
    const key = `improvements.${cardId}.name`
    const translated = t(locale, key)
    if (translated !== key) return translated
  }
  return humanizeCardId(cardId)
}

export const translateCardText = (
  locale: Locale,
  key: string,
  params?: Record<string, string | number>,
): string => {
  const translated = t(locale, key, params)
  if (translated !== key) return translated

  const nameMatch = cardNameKeyPattern.exec(key)
  if (nameMatch) {
    const [, prefix, cardId] = nameMatch
    const cardType =
      prefix === 'occupations'
        ? 'occupation'
        : prefix === 'minorImprovements'
          ? 'minor'
          : 'major'
    return getCardDisplayName(locale, cardType, cardId)
  }

  const anytimeMatch = cardAnytimeKeyPattern.exec(key)
  if (anytimeMatch) {
    const [, cardId] = anytimeMatch
    return getCardDisplayName(locale, inferCardType(cardId, locale), cardId)
  }

  return translated
}
