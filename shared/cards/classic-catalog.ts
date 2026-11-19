import { classicCardDefinitions } from './classic-catalog.generated.ts'

type ClassicCardDefinition = (typeof classicCardDefinitions)[number]

const byId = new Map<string, ClassicCardDefinition>(classicCardDefinitions.map(card => [card.id, card]))

/**
 * Runtime-only classic Card Definitions. The ordinary catalog, deal pool, encyclopedia and client manifest never
 * include them; callers that reach classic cards by exact ID (dev draw / play) read their kind here.
 */
export const getClassicCardDefinition = (id: string): ClassicCardDefinition | undefined => byId.get(id)

export const getClassicCardKind = (id: string): 'occupation' | 'minor' | undefined => {
  const card = byId.get(id)
  if (!card) return undefined
  if (card.kind === 'playerAction') return card.playerActionCardType === 'occupation' ? 'occupation' : 'minor'
  return card.kind
}

/** Classic minor-like definitions (minor or minor-type player action), for lookups by exact ID only. */
export const getClassicMinorImprovement = (id: string): ClassicCardDefinition | undefined =>
  getClassicCardKind(id) === 'minor' ? byId.get(id) : undefined

/** Classic occupation-like definitions (occupation or occupation-type player action), for lookups by exact ID only. */
export const getClassicOccupation = (id: string): ClassicCardDefinition | undefined =>
  getClassicCardKind(id) === 'occupation' ? byId.get(id) : undefined
