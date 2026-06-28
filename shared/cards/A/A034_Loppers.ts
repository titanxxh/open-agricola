import { defineMinorCard } from '../card-source'
import type { CardListenerContext, CardListenerRegistration } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { payGainNode } from '../helpers/pay-gain-node'
import type { CardImpl } from '../registry'

const CARD_ID = 'A034_Loppers'
type FenceBuiltLike = {
  type: 'farm.fenceBuilt'
  newFenceEdges?: unknown
}

const builtOrdinaryFence = (context: CardListenerContext): boolean => {
  const events = context.actionEvents ?? context.transactionEvents
  return events.some((event): boolean => {
    if (event.type !== 'farm.fenceBuilt') return false
    const fenceEvent = event as FenceBuiltLike
    return Array.isArray(fenceEvent.newFenceEdges) && fenceEvent.newFenceEdges.length > 0
  })
}

const listener: CardListenerRegistration = {
  id: 'A34-loppers-after-fencing',
  cardIds: [CARD_ID],
  phases: ['after' as ActionHookPhase],
  actions: ['fence'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (!builtOrdinaryFence(context)) return
    return payGainNode({
      cardId: CARD_ID,
      cost: { wood: 1, fence: 1 },
      gain: { food: 2, score: 1 },
    })
  },
}

const cardImpl = {
  listeners: [listener],
  reaches: [] as readonly string[],
} satisfies CardImpl

export const A034_Loppers = defineMinorCard({
  meta: {
    id: CARD_ID,
    name: 'Loppers',
    deck: 'A',
    number: 34,
    category: 'POINTS_PROVIDER',
    desc: ['Each time you build 1 or more fences, you can also use this card to exchange 1 <WOOD> and 1 <FENCE> in your supply for 2 <FOOD> and 1 bonus <SCORE>.'],
    cost: { wood: 1 },
    prerequisite: '2 Occupations',
    occupationPrerequisites: { min: 2 },
    extraVp: true,
    waresSalesmanGains: [{ wood: 1, reed: 1 }],
  },
  impl: cardImpl,
})

export const A034_Loppers_impl = A034_Loppers.impl
