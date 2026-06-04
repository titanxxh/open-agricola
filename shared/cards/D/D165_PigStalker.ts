import { defineOccupationCard } from '../card-source'
import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { gainLeaf } from '../helpers/pay-gain-node'
import { spaceHasPlayer } from '../../domain/space'
import type { CardImpl } from '../registry'

const CARD_ID = 'D165_PigStalker'
const ANIMAL_MARKETS = ['sheep-market', 'pig-market', 'cattle-market']

const ADJACENCY_MAP: Record<number, number[]> = {
  1: [2],
  2: [1, 3],
  3: [2, 4],
  4: [3],
  8: [9],
  9: [8],
  10: [11],
  11: [10],
}

const listener: CardListenerRegistration = {
  id: 'D165-pig-stalker-after-place-farmer',
  cardIds: [CARD_ID],
  phases: ['after' as ActionHookPhase],
  actions: ['place-farmer'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    const spaceId = context.space?.id
    if (!spaceId || !ANIMAL_MARKETS.includes(spaceId)) return

    const roundOrder = context.state.roundActionOrder
    const positionIndex = roundOrder.indexOf(spaceId)
    if (positionIndex < 0) return
    const position = positionIndex + 1

    const adjacentPositions = ADJACENCY_MAP[position]
    if (!adjacentPositions || adjacentPositions.length === 0) return

    const adjacentSpaceIds = adjacentPositions
      .map((pos) => roundOrder[pos - 1])
      .filter((id): id is string => id != null)

    const playerOccupiesAdjacent = adjacentSpaceIds.some((adjSpaceId) => {
      const space = context.state.actionSpaces.find((s) => s.id === adjSpaceId)
      return !!space && spaceHasPlayer(space, context.player.id)
    })

    if (!playerOccupiesAdjacent) return

    return { flow: gainLeaf(CARD_ID, { boar: 1 }), sourceCard: CARD_ID }
  },
}

const cardImpl = {
  listeners: [listener],
  reaches: [] as readonly string[],
} satisfies CardImpl

export const D165_PigStalker = defineOccupationCard({
  meta: {
    id: CARD_ID,
    name: 'Pig Stalker',
    deck: 'D',
    number: 165,
    category: 'LIVESTOCK_PROVIDER',
    desc: ['Each time you use an animal accumulation space, you get an additional 1 <PIG> if you occupy a Round 1-14 action space which is immediately to the left or right of that accumulation space.'],
    cost: {},
    players: '4+',
    evenMoreSet: true,
  },
  impl: cardImpl,
})

export const D165_PigStalker_impl = D165_PigStalker.impl
