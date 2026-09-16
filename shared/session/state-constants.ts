// Session-only slice of state-constants. Pure literal/zero-dep helpers
// (`emptyResources`, `resourceKeyList`, `harvestRounds`, `createRoundOpenById`)
// have been hoisted to `shared/contract/state-constants.ts` so the main
// client (which is barred from importing `shared/session/**` per S6c Rule 7)
// can keep using them without crossing the layer.
//
// What remains here is server/session-side logic that legitimately reaches
// into `shared/utils/rng` and `shared/domain/farmyard`. Server code, tests,
// and `shared/session/state-bootstrap.ts` continue to import from this file.
//
// Keep this file free of imports from `../cards/catalog`, `../cards/major`,
// `../cards/register-all`, `../actions/index`, or anything that transitively
// reaches card implementations. Type-only imports from pure modules are fine.

import type { FenceSegment, FenceSegmentSource, GameState, PlayerState, Resource } from '../contract/types'
import type { DraftMode } from '../draft/types'
import { createRng, shuffleWithRng } from '../utils/rng'
import { tryAddRoomTile } from '../domain/farmyard'
import { findPlayerById } from '../domain/player'
import {
  emptyResources,
  extendedResourceKeyList,
  resourceKeyList,
  harvestRounds,
  createRoundOpenById,
} from '../contract/state-constants'

export { emptyResources, extendedResourceKeyList, resourceKeyList, harvestRounds, createRoundOpenById }

const ownFenceSource = (ownerPlayerId: string): FenceSegmentSource => ({
  kind: 'own',
  ownerPlayerId,
})

const normalizeFenceSegmentSource = (
  input: unknown,
  ownerPlayerId: string,
): FenceSegmentSource => {
  if (!input || typeof input !== 'object') return ownFenceSource(ownerPlayerId)
  const source = input as { kind?: unknown; ownerPlayerId?: unknown }
  if (source.kind === 'borrowed' && typeof source.ownerPlayerId === 'string') {
    return { kind: 'borrowed', ownerPlayerId: source.ownerPlayerId }
  }
  if (
    source.kind === 'own' &&
    source.ownerPlayerId === ownerPlayerId
  ) {
    return { kind: 'own', ownerPlayerId }
  }
  return ownFenceSource(ownerPlayerId)
}

export const normalizeFenceSegments = (
  input: unknown,
  ownerPlayerId: string,
): FenceSegment[] => {
  if (!Array.isArray(input)) return []
  return input
    .map((entry): FenceSegment | null => {
      if (entry && typeof entry === 'object' && 'edge' in entry) {
        const e = entry as { edge: unknown; type?: unknown; source?: unknown }
        if (typeof e.edge === 'string') {
          return {
            edge: e.edge,
            type: e.type === 'palisade' ? 'palisade' : 'fence',
            source: normalizeFenceSegmentSource(e.source, ownerPlayerId),
          }
        }
      }
      return null
    })
    .filter((s): s is FenceSegment => s !== null)
}

const roundStageSlots = [
  { stage: 1, count: 4 },
  { stage: 2, count: 3 },
  { stage: 3, count: 2 },
  { stage: 4, count: 2 },
  { stage: 5, count: 2 },
  { stage: 6, count: 1 },
]

const roundStageActions: Record<number, string[]> = {
  1: ['sheep-market', 'grain-utilization', 'fencing', 'major-improvement'],
  2: ['wish-children', 'western-quarry', 'house-redevelopment'],
  3: ['vegetable-seeds', 'pig-market'],
  4: ['eastern-quarry', 'cattle-market'],
  5: ['cultivation', 'urgent-wish-children'],
  6: ['farm-redevelopment'],
}

export const defaultSandboxDeckIds = ['A', 'B', 'C', 'D', 'E'] as const
export type DefaultSandboxDeckId = typeof defaultSandboxDeckIds[number]
export const defaultSandboxPlayerNames = ['playerA', 'playerB', 'playerC', 'playerD', 'playerE', 'playerF'] as const

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
  enableParentCards?: boolean
  enableThroughTheSeasons?: boolean
  enableFarmersOfTheMoor?: boolean
  allowIncompleteFarmersOfTheMoorMinorDeal?: boolean
  /** Snake Opening variant; ignored for single-player games. Default false. */
  enableSnakeOpening?: boolean
  draftParents?: boolean
  parentSelectionSeed?: number
  ordinaryCardDeckSeed?: number
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

export const defaultPlayerColors: PlayerState['color'][] = [
  'red',
  'yellow',
  'blue',
  'black',
  'green',
  'purple',
]

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

export const applyFutureMeeples = (
  state: GameState,
  options: { skipResourceReceive?: boolean; keepActionTokens?: boolean } = {},
) => {
  if (state.futureMeeples.length === 0) return
  const remaining: GameState['futureMeeples'] = []
  state.futureMeeples.forEach((entry) => {
    if (entry.round !== state.round) {
      remaining.push(entry)
      return
    }
    const player = findPlayerById(state, entry.playerId)
    if (!player) return
    Object.entries(entry.resources).forEach(([key, value]) => {
      const amount = value ?? 0
      if (key === 'field' || key === 'stable' || key === 'forest' || key === 'moor') return
      if (options.skipResourceReceive) return
      player.resources[key as keyof Resource] += amount
    })
    if (entry.roomType && player.houseType === entry.roomType) {
      tryAddRoomTile(player, entry.roomType)
    }
    if (options.keepActionTokens) {
      const resources: GameState['futureMeeples'][number]['resources'] = {}
      for (const key of ['field', 'stable', 'forest', 'moor'] as const) {
        const amount = entry.resources[key] ?? 0
        if (amount > 0) resources[key] = amount
      }
      if (Object.keys(resources).length > 0) {
        remaining.push({
          id: entry.id,
          cardId: entry.cardId,
          playerId: entry.playerId,
          round: entry.round,
          actionId: entry.actionId,
          resources,
          ...(entry.actionContext ? { actionContext: entry.actionContext } : {}),
        })
      }
    }
  })
  state.futureMeeples = remaining
}
