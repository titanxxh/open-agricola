import type { Locale } from '../../../shared/i18n'
import { t } from '../../../shared/i18n'
import { getOccupationCard, getMinorImprovementCard } from '../../../shared/cards/catalog'
import { getMajorCardEffect } from '../../../shared/cards/major'

type CardType = 'occupation' | 'minor' | 'major'

const cardNameKeyPattern =
  /^(occupations|minorImprovements|improvements)\.([^.]+)\.name$/

const cardAnytimeKeyPattern =
  /^cards\.([^.]+)\.anytime$/

export const humanizeCardId = (cardId: string): string =>
  cardId
    .replace(/_/g, ' ')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .trim()

const inferCardType = (cardId: string): CardType | null => {
  if (getOccupationCard(cardId)) return 'occupation'
  if (getMinorImprovementCard(cardId)) return 'minor'
  if (getMajorCardEffect(cardId)) return 'major'
  return null
}

export const getCardDisplayName = (
  locale: Locale,
  cardType: CardType | null,
  cardId: string,
): string => {
  if (cardType === 'occupation') {
    const key = `occupations.${cardId}.name`
    const translated = t(locale, key)
    if (translated !== key) return translated
    const card = getOccupationCard(cardId)
    return card?.locales?.[locale]?.name ?? card?.name ?? humanizeCardId(cardId)
  }
  if (cardType === 'minor') {
    const key = `minorImprovements.${cardId}.name`
    const translated = t(locale, key)
    if (translated !== key) return translated
    const card = getMinorImprovementCard(cardId)
    return card?.locales?.[locale]?.name ?? card?.name ?? humanizeCardId(cardId)
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
    return getCardDisplayName(locale, inferCardType(cardId), cardId)
  }

  return translated
}
