import type { MoorSpecialActionCardState, MoorSpecialActionId } from './types'

type MoorSpecialActionCardDefinition = {
  id: string
  players: number[]
  actions: MoorSpecialActionId[]
  image: string
}

export const moorSpecialActionCardDefinitions: MoorSpecialActionCardDefinition[] = [
  {
    id: 'moor-special-1-5-6-market-work',
    players: [1, 5, 6],
    actions: ['black-market', 'illicit-work'],
    image: '/assets/moor/special-action-card/moor-special-1-5-6-market-work.webp',
  },
  {
    id: 'moor-special-6-peat',
    players: [6],
    actions: ['cut-peat'],
    image: '/assets/moor/special-action-card/moor-special-6-peat.webp',
  },
  {
    id: 'moor-special-6-burn',
    players: [6],
    actions: ['slash-and-burn'],
    image: '/assets/moor/special-action-card/moor-special-6-burn.webp',
  },
  {
    id: 'moor-special-1-3-work-market',
    players: [1, 3],
    actions: ['fell-trees', 'hiring-fair', 'black-market', 'illicit-work'],
    image: '/assets/moor/special-action-card/moor-special-1-3-work-market.webp',
  },
  {
    id: 'moor-special-1-5-6-horse',
    players: [1, 5, 6],
    actions: ['horse-market'],
    image: '/assets/moor/special-action-card/moor-special-1-5-6-horse.webp',
  },
  {
    id: 'moor-special-1-5-6-wood-hire',
    players: [1, 5, 6],
    actions: ['fell-trees', 'hiring-fair'],
    image: '/assets/moor/special-action-card/moor-special-1-5-6-wood-hire.webp',
  },
  {
    id: 'moor-special-1-2-terrain',
    players: [1, 2],
    actions: ['fell-trees', 'slash-and-burn', 'cut-peat'],
    image: '/assets/moor/special-action-card/moor-special-1-2-terrain.webp',
  },
  {
    id: 'moor-special-1-2-market-work',
    players: [1, 2],
    actions: ['horse-market', 'hiring-fair', 'black-market', 'illicit-work'],
    image: '/assets/moor/special-action-card/moor-special-1-2-market-work.webp',
  },
  {
    id: 'moor-special-1-3-horse-terrain',
    players: [1, 3],
    actions: ['horse-market', 'slash-and-burn', 'cut-peat'],
    image: '/assets/moor/special-action-card/moor-special-1-3-horse-terrain.webp',
  },
  {
    id: 'moor-special-1-4-work-market',
    players: [1, 4],
    actions: ['hiring-fair', 'black-market', 'illicit-work'],
    image: '/assets/moor/special-action-card/moor-special-1-4-work-market.webp',
  },
  {
    id: 'moor-special-1-4-5-peat-burn',
    players: [1, 4, 5],
    actions: ['slash-and-burn', 'cut-peat'],
    image: '/assets/moor/special-action-card/moor-special-1-4-5-peat-burn.webp',
  },
  {
    id: 'moor-special-1-4-wood-horse',
    players: [1, 4],
    actions: ['fell-trees', 'horse-market'],
    image: '/assets/moor/special-action-card/moor-special-1-4-wood-horse.webp',
  },
]

export const createMoorSpecialActionCards = (playerCount: number): MoorSpecialActionCardState[] =>
  moorSpecialActionCardDefinitions
    .filter((definition) => definition.players.includes(playerCount))
    .map((definition) => ({
      id: definition.id,
      players: [...definition.players],
      actions: [...definition.actions],
      image: definition.image,
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
