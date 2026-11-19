import { allMinorImprovementCards, allOccupationCards, getCardDefinition } from './catalog'
import { getClassicCardsByDeckNumber } from './classic-catalog'

/** A revised deck letter (`E203`) or a classic `C`-prefixed deck code (`CE203`), then the printed number. */
const deckNumberInputRe = /^([A-E]|C[A-Z]+)(\d+)$/i

export const resolveDevCardIdInput = (input: string): string => {
  const trimmed = input.trim()
  if (getCardDefinition(trimmed)) return trimmed

  const match = trimmed.match(deckNumberInputRe)
  if (!match) return trimmed

  const deck = match[1]!.toUpperCase()
  const number = Number.parseInt(match[2]!, 10)
  const matches = deck.length === 1
    ? [...allMinorImprovementCards, ...allOccupationCards].filter((card) => card.deck === deck && card.number === number)
    : getClassicCardsByDeckNumber(deck, number)

  return matches.length === 1 ? matches[0]!.id : trimmed
}
