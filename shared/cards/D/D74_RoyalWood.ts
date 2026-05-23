import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { readCardExtraData, writeCardExtraData } from '../helpers/card-state'
import { sumResourcePaid } from '../helpers/event-provenance'
import { gainLeaf } from '../helpers/pay-gain-node'
import type { CardImpl } from '../registry'
import { D74_RoyalWood } from '../../cards-display/D/D74_RoyalWood'

const CARD_ID = D74_RoyalWood.id

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

export const D74_RoyalWood_impl = {
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
