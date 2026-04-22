// Client-safe slice of `shared/logic/state`: pure data constants and helpers
// that do NOT import `../cards/catalog` or any card implementation module.
//
// Client code should import from this module. The full `./state` module
// re-exports everything from here in addition to catalog-dependent helpers
// (createInitialState, dealHands, normalizeState, cloneState, ...).
//
// Keep this file free of imports from `../cards/catalog`, `../cards/major`,
// `../cards/register-all`, `../actions/index`, or anything that transitively
// reaches card implementations. Type-only imports from pure modules are fine.

import type { ActionSpace, FenceSegment, GameState, PlayerState, Resource } from '../game/types'
import type { DraftMode } from '../draft/types'
import { createRng, shuffleWithRng } from './rng'

export { createSeed, createRng, shuffleWithRng } from './rng'

export const normalizeFenceSegments = (input: unknown): FenceSegment[] => {
  if (!Array.isArray(input)) return []
  return input
    .map((entry): FenceSegment | null => {
      if (typeof entry === 'string') return { edge: entry, type: 'fence' }
      if (entry && typeof entry === 'object' && 'edge' in entry) {
        const e = entry as { edge: unknown; type?: unknown }
        if (typeof e.edge === 'string') {
          return { edge: e.edge, type: e.type === 'palisade' ? 'palisade' : 'fence' }
        }
      }
      return null
    })
    .filter((s): s is FenceSegment => s !== null)
}

export const emptyResources: Resource = {
  wood: 0,
  clay: 0,
  reed: 0,
  stone: 0,
  food: 0,
  grain: 0,
  vegetable: 0,
  sheep: 0,
  boar: 0,
  cattle: 0,
  begging: 0,
}

export const resourceKeyList: (keyof Resource)[] = [
  'wood',
  'clay',
  'reed',
  'stone',
  'food',
  'grain',
  'vegetable',
  'sheep',
  'boar',
  'cattle',
  'begging',
]

export const roundStageSlots = [
  { stage: 1, count: 4 },
  { stage: 2, count: 3 },
  { stage: 3, count: 2 },
  { stage: 4, count: 2 },
  { stage: 5, count: 2 },
  { stage: 6, count: 1 },
]

export const roundStageActions: Record<number, string[]> = {
  1: ['sheep-market', 'grain-utilization', 'fencing', 'major-improvement'],
  2: ['wish-children', 'western-quarry', 'house-redevelopment'],
  3: ['vegetable-seeds', 'pig-market'],
  4: ['eastern-quarry', 'cattle-market'],
  5: ['cultivation', 'urgent-wish-children'],
  6: ['farm-redevelopment'],
}

export const baseActionOrder = [
  'forest',
  'copse',
  'grove',
  'clay-pit',
  'hollow',
  'hollow-4',
  'reed-bank',
  'fishing',
  'traveling-players',
  'day-laborer',
  'meeting-place',
  'lessons',
  'lessons-3',
  'lessons-4',
  'farmland',
  'grain-seeds',
  'farm-expansion',
  'resource-market',
  'resource-market-4',
]

export const defaultSandboxDeckIds = ['A', 'B', 'C', 'D', 'E'] as const
export type DefaultSandboxDeckId = typeof defaultSandboxDeckIds[number]
export const defaultSandboxPlayerNames = ['playerA', 'playerB', 'playerC', 'playerD'] as const

export type InitialStateOptions = {
  playerCount?: number
  extraMinorIds?: string[]
  extraOccupationIds?: string[]
  deckIds?: string[]
  playerNames?: string[]
  /**
   * Optional simultaneous-draft configuration. When `draftMode='simultaneous'`,
   * `createInitialState` seeds `state.draft` with per-player card pools instead
   * of dealing cards directly into `player.occupationHand` / `player.minorHand`,
   * and sets `state.phase='draft'`. See `shared/draft/`.
   */
  draftMode?: DraftMode
  /** Draft pool size per card type (7..10). Required when `draftMode='simultaneous'`. */
  draftPoolSize?: number
  /** When true, include community-deck cards in the deal pool. Default false. */
  enableCommunityDeck?: boolean
}

export const generateRoundActionOrder = (seed: number) => {
  const rng = createRng(seed)
  const order: (string | null)[] = []
  roundStageSlots.forEach(({ stage, count }) => {
    const pool = roundStageActions[stage] ?? []
    const shuffled = shuffleWithRng(pool, rng)
    for (let index = 0; index < count; index += 1) {
      order.push(shuffled[index] ?? null)
    }
  })
  return order
}

export const createRoundOpenById = (order: (string | null)[]) =>
  new Map(
    order
      .map((id, index) => (id ? [id, index + 1] : null))
      .filter((item): item is [string, number] => item !== null),
  )

export const isActionForPlayerCount = (
  space: ActionSpace,
  playerCount: number,
) => !space.players || space.players.includes(playerCount)

export const defaultPlayerColors: PlayerState['color'][] = [
  'red',
  'yellow',
  'blue',
  'black',
]

export const harvestRounds = [4, 7, 9, 11, 13, 14]

export const applyRoundGrowth = (state: GameState) => {
  const roundOpenById = createRoundOpenById(state.roundActionOrder)
  state.actionSpaces.forEach((space) => {
    const openRound = roundOpenById.get(space.id) ?? space.roundAvailable
    if (state.round >= openRound) {
      Object.entries(space.gainPerRound).forEach(([key, value]) => {
        const amount = value ?? 0
        space.resources[key as keyof Resource] += amount
      })
    }
  })
}

export const applyFutureMeeples = (state: GameState) => {
  if (state.futureMeeples.length === 0) return
  const remaining: GameState['futureMeeples'] = []
  state.futureMeeples.forEach((entry) => {
    if (entry.round !== state.round) {
      remaining.push(entry)
      return
    }
    const player = state.players.find((item) => item.id === entry.playerId)
    if (!player) return
    Object.entries(entry.resources).forEach(([key, value]) => {
      const amount = value ?? 0
      player.resources[key as keyof Resource] += amount
    })
  })
  state.futureMeeples = remaining
}
