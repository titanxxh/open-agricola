import { defineMinorCard } from '../card-source'
import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { readCardExtraData, writeCardExtraData } from '../helpers/card-state'
import { sumResourcePaid } from '../helpers/event-provenance'
import { gainLeaf } from '../helpers/pay-gain-node'
import type { CardImpl } from '../registry'

const CARD_ID = 'D74_RoyalWood'
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
  onEndTurn: (_state, player) => {
    const totalSpent = readCardExtraData<number>(player, CARD_ID, 'woodSpent') ?? 0
    const refund = Math.floor(totalSpent / 2)
    writeCardExtraData(player, CARD_ID, 'woodSpent', 0)
    writeCardExtraData(player, CARD_ID, 'woodBefore', 0)
    if (refund <= 0) return
    return gainLeaf(CARD_ID, { wood: refund })
  },
},
  reaches: [] as readonly string[],
} satisfies CardImpl

export const D74_RoyalWood = defineMinorCard({
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

export const D74_RoyalWood_impl = D74_RoyalWood.impl
