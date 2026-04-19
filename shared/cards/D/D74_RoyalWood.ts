import { MinorImprovement } from '../types'
import { registerCardEffect } from '../card-effects'
import { registerCardListener } from '../card-listeners'
import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { readCardExtraData, writeCardExtraData } from '../helpers/card-state'
import { gainLeaf } from '../helpers/pay-gain-node'

const CARD_ID = 'D74_RoyalWood'

/**
 * Track wood spent during construct, stables, and improvement-any actions.
 * before: snapshot wood before action
 * after: diff wood spent and accumulate
 */
const TRACKED_ACTIONS = ['construct', 'stables', 'improvement-any']

const beforeListener: CardListenerRegistration = {
  id: 'D74-royal-wood-before',
  cardIds: [CARD_ID],
  actions: TRACKED_ACTIONS,
  phases: ['before' as ActionHookPhase],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    writeCardExtraData(context.player, CARD_ID, 'woodBefore', context.player.resources.wood)
  },
}

const afterListener: CardListenerRegistration = {
  id: 'D74-royal-wood-after',
  cardIds: [CARD_ID],
  actions: TRACKED_ACTIONS,
  phases: ['after' as ActionHookPhase],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    const before = readCardExtraData<number>(context.player, CARD_ID, 'woodBefore') ?? context.player.resources.wood
    const spent = Math.max(0, before - context.player.resources.wood)
    if (spent <= 0) return
    const total = (readCardExtraData<number>(context.player, CARD_ID, 'woodSpent') ?? 0) + spent
    writeCardExtraData(context.player, CARD_ID, 'woodSpent', total)
  },
}

registerCardListener(beforeListener)
registerCardListener(afterListener)

registerCardEffect({
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
})

export const D74_RoyalWood = new MinorImprovement({
  id: CARD_ID,
  name: 'Royal Wood',
  deck: 'D',
  number: 74,
  category: 'BUILDING_RESOURCE_PROVIDER',
  desc: [
    'At the end of each turn in which you use the __Farm Expansion__ action space or build an improvement, you get 1 <WOOD> back for every 2 <WOOD> paid during those actions (rounded down).',
  ],
  cost: { food: 1 },
})
