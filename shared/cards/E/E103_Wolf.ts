import { Occupation } from '../types'
import { registerCardEffect } from '../card-effects'
import { registerCardListener } from '../card-listeners'
import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { getCardStack, pushToCardStack, popFromCardStack } from '../helpers/card-state'
import { gainLeaf } from '../helpers/pay-gain-node'
import type { Resource } from '../../game/types'

const CARD_ID = 'E103_Wolf'

/**
 * onBuy: push stack ['clay', 'wood', 'grain'] (grain on top)
 */
registerCardEffect({
  id: CARD_ID,
  onBuy: (_state, player) => {
    pushToCardStack(player, CARD_ID, ['clay', 'wood', 'grain'])
  },
})

/**
 * After gain/collect: if the gained resources include the top-of-stack resource,
 * pop the top item from the stack and gain 1 pig.
 * This is optional (XOR with skip).
 */
const afterGainCollectListener: CardListenerRegistration = {
  id: 'E103-wolf-after-gain-collect',
  cardIds: [CARD_ID],
  actions: ['gain', 'collect'],
  phases: ['after' as ActionHookPhase],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (!context.player.occupationPlayed.includes(CARD_ID)) return
    const stack = getCardStack(context.player, CARD_ID)
    if (stack.length === 0) return
    const top = stack[stack.length - 1] as keyof Resource
    const gained =
      context.result?.type === 'ok' ? context.result.resourcesGained : undefined
    if (!gained || (gained[top] ?? 0) <= 0) return
    // Pop top and gain pig
    popFromCardStack(context.player, CARD_ID)
    return {
      flow: gainLeaf(CARD_ID, { boar: 1 }),
      sourceCard: CARD_ID,
    }
  },
}

registerCardListener(afterGainCollectListener)

export const E103_Wolf = new Occupation({
  id: CARD_ID,
  name: 'Wolf',
  deck: 'E',
  number: 103,
  desc: [
    'Pile (from bottom to top) 1 <CLAY>, 1 <WOOD>, and 1 <GRAIN> on this card. Each time you get a good matching the top item, you can move that item to your supply and get 1 <PIG>.',
  ],
  cost: {},
  players: '1+',
})
