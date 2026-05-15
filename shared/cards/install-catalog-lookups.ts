import { MinorImprovement, Occupation, PlayerActionCard } from '../cards-display/types'
import type { CardBase } from '../cards-display/types'
import { getCustomMinorImprovement, getCustomOccupation } from './custom-registry'
import { allMinorImprovementCards, allOccupationCards } from './catalog'
import { registerCardLookups } from './registry-runtime'

let installed = false

const cardMatchesMinor = (card: unknown): card is MinorImprovement =>
  card instanceof MinorImprovement || card instanceof PlayerActionCard

const cardMatchesOccupation = (card: unknown): card is Occupation =>
  card instanceof Occupation

export const ensureCatalogLookupsInstalled = (): void => {
  if (installed) return
  const allCards: readonly CardBase[] = [
    ...allMinorImprovementCards,
    ...allOccupationCards,
  ]
  registerCardLookups({
    minor: (id) =>
      allCards.find((card) => card.id === id && cardMatchesMinor(card))
      ?? getCustomMinorImprovement(id)
      ?? undefined,
    occupation: (id) =>
      allCards.find((card) => card.id === id && cardMatchesOccupation(card))
      ?? getCustomOccupation(id)
      ?? undefined,
  })
  installed = true
}
