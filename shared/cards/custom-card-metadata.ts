import type { CardDefinition } from '../contract/cards'

export type CustomCardMetadata = {
  cardType: 'minor' | 'occupation'
  cardJson: Omit<CardDefinition, 'modifier' | 'modifiers'>
  artUrl?: string | null
}

const customMetadata = new Map<string, CustomCardMetadata>()
const customArtUrls = new Map<string, string>()
const customNumbering = new Map<string, string>()
let nextMinorNumber = 1
let nextOccupationNumber = 500

const displayOnlyCardJson = (
  cardJson: CardDefinition,
): CustomCardMetadata['cardJson'] => {
  const { modifier: _modifier, modifiers: _modifiers, ...display } = cardJson
  return display
}

export function registerCustomCardMetadata(data: {
  cardType: 'minor' | 'occupation'
  cardJson: CardDefinition
  artUrl?: string | null
}): void {
  const { cardType, cardJson, artUrl } = data
  customMetadata.set(cardJson.id, {
    cardType,
    cardJson: displayOnlyCardJson(cardJson),
    artUrl: artUrl ?? null,
  })

  if (!customNumbering.has(cardJson.id)) {
    const next = cardType === 'minor' ? nextMinorNumber++ : nextOccupationNumber++
    customNumbering.set(cardJson.id, `O${String(next).padStart(3, '0')}`)
  }

  if (artUrl) {
    customArtUrls.set(cardJson.id, artUrl)
  } else {
    customArtUrls.delete(cardJson.id)
  }
}

export function getCustomCardMetadata(id: string): CustomCardMetadata | undefined {
  return customMetadata.get(id)
}

export function getCustomCardNumbering(id: string): string | null {
  return customNumbering.get(id) ?? null
}

export function getCustomCardArtUrl(id: string): string | null {
  return customArtUrls.get(id) ?? null
}

export function clearCustomCardMetadata(): void {
  customMetadata.clear()
  customArtUrls.clear()
  customNumbering.clear()
  nextMinorNumber = 1
  nextOccupationNumber = 500
}
