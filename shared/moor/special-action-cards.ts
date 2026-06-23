import type { MoorSpecialActionCardState, MoorSpecialActionId } from './types'

type MoorSpecialActionCardDefinition = {
  id: string
  players: number[]
  actions: MoorSpecialActionId[]
}

export const moorSpecialActionCardDefinitions: MoorSpecialActionCardDefinition[] = [
  { id: 'moor-special-cut-peat', players: [2, 3, 4, 5, 6], actions: ['cut-peat'] },
  { id: 'moor-special-fell-trees', players: [2, 3, 4, 5, 6], actions: ['fell-trees'] },
  { id: 'moor-special-slash-and-burn', players: [2, 3, 4, 5, 6], actions: ['slash-and-burn'] },
  { id: 'moor-special-hiring-fair', players: [2, 3, 4, 5, 6], actions: ['hiring-fair'] },
]

export const createMoorSpecialActionCards = (playerCount: number): MoorSpecialActionCardState[] =>
  moorSpecialActionCardDefinitions
    .filter((definition) => definition.players.includes(playerCount))
    .map((definition) => ({
      id: definition.id,
      players: [...definition.players],
      actions: [...definition.actions],
      location: { kind: 'market' },
    }))

export const normalizeMoorSpecialActionCards = (
  raw: unknown,
  playerCount: number,
): MoorSpecialActionCardState[] => {
  const fallback = createMoorSpecialActionCards(playerCount)
  if (!Array.isArray(raw)) return fallback
  return fallback.map((card) => {
    const saved = raw.find((entry) =>
      entry &&
      typeof entry === 'object' &&
      (entry as { id?: unknown }).id === card.id)
    if (!saved || typeof saved !== 'object') return card
    const rawLocation = (saved as { location?: unknown }).location
    if (!rawLocation || typeof rawLocation !== 'object') return card
    const location = rawLocation as { kind?: unknown; playerId?: unknown }
    if (location.kind === 'market') return { ...card, location: { kind: 'market' } }
    if (
      (location.kind === 'playerFaceUp' || location.kind === 'playerFaceDown') &&
      typeof location.playerId === 'string'
    ) {
      return { ...card, location: { kind: location.kind, playerId: location.playerId } }
    }
    return card
  })
}
