import { Occupation } from '../types'
import type { CardListenerContext, CardListenerRegistration } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import type { GameState } from '../../game/types'
import { gainLeaf } from '../helpers/pay-gain-node'
import { spaceHasPlayer } from '../../game/space'
import type { CardImpl } from '../registry'

const CARD_ID = 'C117_Legworker'

/**
 * C117 Legworker (Occupation)
 *
 * "Each time you use an action space that is orthogonally adjacent to another
 * action space occupied by one of your people, you get 1 wood."
 *
 * BGA: isActionCardEvent(null) — fires for any action-card placement.
 * onPlayerPlaceFarmer checks hasAdjacentWorker via a static adjacency map.
 *
 * In open-agricola we use the space-id adjacency map below. Round-numbered
 * spaces (BGA indices 1..14) are resolved through state.roundActionOrder.
 * We intentionally cover the spaces we ship; any id not present in the map
 * simply yields no neighbours.
 */

// Neighbours for the common (non-round-revealed) action spaces. Round spaces
// are handled separately via position indices 1..14.
const COMMON_ADJACENCY: Record<string, (string | number)[]> = {
  forest: [1, 5, 'grain-seeds', 'clay-pit'],
  'clay-pit': [8, 'forest', 'farmland', 'reed-bank'],
  'reed-bank': [8, 10, 'clay-pit', 'fishing', 'lessons'],
  fishing: [10, 13, 'reed-bank', 'day-laborer'],
  'farm-expansion': [1, 'meeting-place', 'copse', 'grove'],
  'meeting-place': ['farm-expansion', 'grove', 'grain-seeds'],
  'grain-seeds': ['meeting-place', 'resource-market', 'forest', 'farmland'],
  farmland: ['grain-seeds', 'lessons', 'clay-pit', 'hollow-4'],
  lessons: ['farmland', 'lessons-4', 'reed-bank', 'day-laborer'],
  'day-laborer': [12, 'lessons', 'fishing', 'traveling-players'],
  copse: ['grove', 'farm-expansion'],
  grove: ['copse', 'resource-market', 'meeting-place', 'farm-expansion'],
  'resource-market': ['grove', 'hollow-4', 'grain-seeds'],
  'resource-market-4': ['grove', 'hollow-4', 'grain-seeds'],
  'hollow-4': ['resource-market', 'resource-market-4', 'farmland', 'lessons-4'],
  'lessons-4': ['hollow-4', 'lessons', 'traveling-players'],
  'traveling-players': ['lessons-4', 'day-laborer'],
}

// Neighbours for round positions 1..14 (1-indexed).
// Values are either another round position (number) or a space id (string).
const ROUND_ADJACENCY: Record<number, (string | number)[]> = {
  1: [2, 'farm-expansion', 'forest'],
  2: [1, 3, 5],
  3: [2, 4, 6],
  4: [3, 7],
  5: [2, 6, 8, 'forest'],
  6: [3, 5, 7, 9],
  7: [4, 6],
  8: [5, 9, 10, 'clay-pit', 'reed-bank'],
  9: [6, 8, 11],
  10: [8, 11, 'reed-bank', 'fishing'],
  11: [9, 10, 14],
  12: [13, 'day-laborer'],
  13: [12, 14, 'fishing'],
  14: [11, 13],
}

const getRoundPosition = (state: GameState, spaceId: string): number => {
  const idx = state.roundActionOrder.findIndex((id) => id === spaceId)
  return idx < 0 ? -1 : idx + 1
}

const resolveNeighbourIds = (
  state: GameState,
  neighbours: (string | number)[] | undefined,
): string[] => {
  if (!neighbours) return []
  const ids: string[] = []
  for (const entry of neighbours) {
    if (typeof entry === 'number') {
      const id = state.roundActionOrder[entry - 1]
      if (id) ids.push(id)
    } else if (entry) {
      ids.push(entry)
    }
  }
  return ids
}

const getAdjacentSpaceIds = (state: GameState, spaceId: string): string[] => {
  const common = COMMON_ADJACENCY[spaceId]
  if (common) return resolveNeighbourIds(state, common)
  const pos = getRoundPosition(state, spaceId)
  if (pos < 0) return []
  return resolveNeighbourIds(state, ROUND_ADJACENCY[pos])
}

export const hasAdjacentWorker = (
  state: GameState,
  playerId: string,
  spaceId: string,
): boolean => {
  const neighbours = getAdjacentSpaceIds(state, spaceId)
  if (neighbours.length === 0) return false
  return neighbours.some((adj) => {
    const space = state.actionSpaces.find((s) => s.id === adj)
    return !!space && spaceHasPlayer(space, playerId)
  })
}

const listener: CardListenerRegistration = {
  id: 'C117-legworker-after-place-farmer',
  cardIds: [CARD_ID],
  phases: ['after' as ActionHookPhase],
  actions: ['place-farmer'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    const spaceId = context.space?.id
    if (!spaceId) return
    if (!hasAdjacentWorker(context.state, context.player.id, spaceId)) return
    return { flow: gainLeaf(CARD_ID, { wood: 1 }), sourceCard: CARD_ID }
  },
}

export const C117_Legworker = new Occupation({
  id: CARD_ID,
  name: 'Legworker',
  deck: 'C',
  number: 117,
  category: 'BUILDING_RESOURCE_PROVIDER',
  desc: [
    'Each time you use an action space that is orthogonally adjacent to another action space occupied by one of your people, you get 1 <WOOD>.',
  ],
  cost: {},
  players: '1+',
})

export const C117_Legworker_impl = {
  listeners: [listener],
  reaches: [] as readonly string[],
} satisfies CardImpl
