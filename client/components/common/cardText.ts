import type { Locale } from '../../../shared/i18n'
import { t } from '../../../shared/i18n'
import { getCardMeta, type CardMeta } from '../../services/card-meta'

export type CardType = 'occupation' | 'minor' | 'major'

const cardNameKeyPattern =
  /^(occupations|minorImprovements|improvements|cards)\.([^.]+)\.name$/

const cardAnytimeKeyPattern =
  /^cards\.([^.]+)\.anytime$/

const humanizeCardId = (cardId: string): string =>
  cardId
    .replace(/_/g, ' ')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .trim()

const inferCardType = (cardId: string): CardType | null => {
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
      return meta.playerActionCardType ?? 'occupation'
    }
    default:
      return null
  }
}

export const getAnyCardDisplayName = (
  locale: Locale,
  cardId: string,
): string => getCardDisplayName(locale, inferCardType(cardId), cardId)

export const getCardDisplayName = (
  locale: Locale,
  cardType: CardType | null,
  cardId: string,
  meta = getCardMeta(cardId),
): string => {
  const season = /^through-the-seasons:(winter|spring|summer|autumn)$/.exec(cardId)?.[1]
  if (season) return t(locale, `ui.seasons.${season}`)

  const prefixes = cardType === 'occupation' ? ['occupations']
    : cardType === 'minor' ? ['minorImprovements']
      : cardType === 'major' ? ['improvements']
        : ['improvements', 'minorImprovements', 'occupations']
  for (const prefix of prefixes) {
    const key = `${prefix}.${cardId}.name`
    const translated = t(locale, key)
    if (translated !== key) return translated
  }
  const localized = meta?.locales?.[locale]?.name
  if (localized) return localized
  const legacyKey = `cards.${cardId}.name`
  const legacyName = t(locale, legacyKey)
  if (legacyName !== legacyKey) return legacyName
  return meta?.name || humanizeCardId(cardId)
}

const localizedLinesOrSource = (localized: string[] | undefined, source: string[] | undefined): string => {
  const text = localized?.join('\n')
  return text?.trim() ? text : (source ?? []).join('\n')
}

export const getCardDisplayText = (
  locale: Locale,
  cardType: CardType,
  cardId: string,
  meta: CardMeta,
) => {
  const prefix = cardType === 'occupation' ? 'occupations'
    : cardType === 'minor' ? 'minorImprovements' : 'improvements'
  const localized = meta.locales?.[locale]
  const field = (name: string, fallback: string): string => {
    const key = `${prefix}.${cardId}.${name}`
    const translated = t(locale, key)
    return translated === key ? fallback : translated
  }
  const prerequisite = localized?.prerequisite?.trim() ? localized.prerequisite : meta.prerequisite
  return {
    name: getCardDisplayName(locale, cardType, cardId, meta),
    description: field('description', localizedLinesOrSource(localized?.desc, meta.desc)),
    rules: field('rules', localizedLinesOrSource(localized?.rules, meta.rules)),
    prerequisite: field('prerequisite', typeof prerequisite === 'string' ? prerequisite : '') || undefined,
  }
}

export const translateCardText = (
  locale: Locale,
  key: string,
  params?: Record<string, string | number>,
): string => {
  const resolveNames = (text: string) => text.replace(
    /\{card:([^{}\s]+)\}/g,
    (_reference, cardId: string) => getAnyCardDisplayName(locale, cardId),
  )
  const nameMatch = cardNameKeyPattern.exec(key)
  if (nameMatch) {
    const [, prefix, cardId] = nameMatch
    const cardType =
      prefix === 'occupations'
        ? 'occupation'
        : prefix === 'minorImprovements'
          ? 'minor'
          : prefix === 'improvements'
            ? 'major'
            : inferCardType(cardId)
    return getCardDisplayName(locale, cardType, cardId)
  }

  const translated = t(locale, key, params)
  if (translated !== key) return resolveNames(translated)

  const anytimeMatch = cardAnytimeKeyPattern.exec(key)
  if (anytimeMatch) {
    const [, cardId] = anytimeMatch
    return getCardDisplayName(locale, inferCardType(cardId), cardId)
  }

  return resolveNames(translated)
}
