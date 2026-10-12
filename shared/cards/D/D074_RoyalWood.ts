import { defineMinorCard } from '../card-source'
import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { readCardExtraData, writeCardExtraData } from '../helpers/card-state'
import { sumResourcePaid } from '../helpers/event-provenance'
import type { CardImpl } from '../registry'

const CARD_ID = 'D074_RoyalWood'
const TRACKED_PAIRED_ACTIONS = ['construct']
const TRACKED_PAIRED_PURPOSES = new Set(['construct'])
const TRACKED_PAY_PURPOSES = new Set(['major-improvement', 'minor-improvement', 'stables'])

const afterListener: CardListenerRegistration = {
  id: 'D74-royal-wood-after',
  cardIds: [CARD_ID],
  actions: TRACKED_PAIRED_ACTIONS,
  phases: ['after' as ActionHookPhase],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    const events = context.actionEvents ?? context.transactionEvents
    const wood = sumResourcePaid(events, 'wood', (event) =>
      TRACKED_PAIRED_PURPOSES.has(event.paymentFor),
    )
    if (wood <= 0) return
    const total = (readCardExtraData<number>(context.player, CARD_ID, 'woodSpent') ?? 0) + wood
    return {
      flow: {
        type: 'leaf',
        actionId: 'special-effect',
        sourceCard: CARD_ID,
        params: { kind: 'set-extra-data', key: 'woodSpent', value: total },
      },
      sourceCard: CARD_ID,
    }
  },
}

const afterPayListener: CardListenerRegistration = {
  id: 'D74-royal-wood-after-pay',
  cardIds: [CARD_ID],
  actions: ['pay'],
  phases: ['after' as ActionHookPhase],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    const events = context.actionEvents ?? context.transactionEvents
    const wood = sumResourcePaid(events, 'wood', (event) =>
      TRACKED_PAY_PURPOSES.has(event.paymentFor),
    )
    if (wood <= 0) return
    const total = (readCardExtraData<number>(context.player, CARD_ID, 'woodSpent') ?? 0) + wood
    return {
      flow: {
        type: 'leaf',
        actionId: 'special-effect',
        sourceCard: CARD_ID,
        params: { kind: 'set-extra-data', key: 'woodSpent', value: total },
      },
      sourceCard: CARD_ID,
    }
  },
}

const cardImpl = {
  listeners: [afterListener, afterPayListener],
  effect: {
  id: CARD_ID,
  onBuy: (_state, player) => {
    writeCardExtraData(player, CARD_ID, 'woodSpent', 0)
    writeCardExtraData(player, CARD_ID, 'woodBefore', 0)
  },
  timedRules: [{ retainAfterCardLeaves: true, key: 'paid-wood-refund', at: { kind: 'card-positive', fact: 'woodSpent', clock: 'current-turn', phase: 'onEndTurn' }, body: { kind: 'operation', operation: { kind: 'card-fact-refund', fact: 'woodSpent', divisor: 2, resource: 'wood' } } }],
},
  reaches: [] as readonly string[],
} satisfies CardImpl

export const D074_RoyalWood = defineMinorCard({
  meta: {
    id: CARD_ID,
    name: 'Royal Wood',
    deck: 'D',
    number: 74,
    category: 'BUILDING_RESOURCE_PROVIDER',
    desc: [
        'At the end of each turn in which you use the __Farm Expansion__ action space or build an improvement, you get 1 <WOOD> back for every 2 <WOOD> paid during those actions (rounded down).',
      ],
    cost: { food: 1 },
  },
  impl: cardImpl,
})

export const D074_RoyalWood_impl = D074_RoyalWood.impl
