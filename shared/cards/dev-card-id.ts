import { allMinorImprovementCards, allOccupationCards, getCardDefinition } from './catalog'

const deckNumberInputRe = /^([A-E])(\d+)$/i

export const resolveDevCardIdInput = (input: string): string => {
  const trimmed = input.trim()
  if (getCardDefinition(trimmed)) return trimmed

  const match = trimmed.match(deckNumberInputRe)
  if (!match) return trimmed

  const deck = match[1]!.toUpperCase()
  const number = Number.parseInt(match[2]!, 10)
  const matches = [...allMinorImprovementCards, ...allOccupationCards]
    .filter((card) => card.deck === deck && card.number === number)

  return matches.length === 1 ? matches[0]!.id : trimmed
}
