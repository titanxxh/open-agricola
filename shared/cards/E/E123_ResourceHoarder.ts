import { Occupation } from '../types'
import { registerCardEffect } from '../card-effects'
import { registerCardListener } from '../card-listeners'
import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { writeCardInfobox } from '../helpers/card-state'

const CARD_ID = 'E123_ResourceHoarder'

/**
 * E123 Resource Hoarder (Occupation, E, 123)
 * On purchase: pile resources on card from bottom to top:
 * stone, clay, stone, reed, wood, clay.
 *
 * Player can use the top item(s) when building a room, playing/building
 * an improvement, or renovating. Using top items reduces the cost.
 *
 * BGA: onBuy places the stack, then computeCosts listeners offer "use top k"
 * as bonus choices, and afterPay removes the used items.
 *
 * Simplified: on buy, store the stack in card state. Provide a computeCosts
 * listener that offers a discount equal to the top N resources from the stack.
 * After paying, remove the used resources from the stack.
 */

// Stack from bottom to top: stone, clay, stone, reed, wood, clay
const INITIAL_STACK = ['stone', 'clay', 'stone', 'reed', 'wood', 'clay'] as const

const getStack = (player: { cardStates?: Record<string, { stack?: string[] }> }): string[] =>
  player.cardStates?.[CARD_ID]?.stack ?? []

const updateInfobox = (player: Parameters<typeof writeCardInfobox>[0]) => {
  const stack = getStack(player)
  if (stack.length === 0) return
  writeCardInfobox(player, CARD_ID, `Stack: ${stack.join(', ')} (top→)`)
}

registerCardEffect({
  id: CARD_ID,
  onBuy: (_state, player) => {
    if (!player.cardStates) player.cardStates = {}
    if (!player.cardStates[CARD_ID]) player.cardStates[CARD_ID] = {}
    // Store stack bottom-to-top
    player.cardStates[CARD_ID]!.stack = [...INITIAL_STACK]
    updateInfobox(player)
  },
})

/**
 * computeCosts listener: for construct, improvement-any, minor-improvement, and renovate,
 * offer a discount from the top of the stack.
 *
 * We offer taking the topmost resource as a discount. If the top resource matches
 * something in the cost, it effectively reduces that cost by 1.
 */
const computeCostsListener: CardListenerRegistration = {
  id: 'E123-resource-hoarder-compute-costs',
  cardIds: [CARD_ID],
  phases: ['computeCosts' as ActionHookPhase],
  actions: ['construct', 'improvement-any', 'minor-improvement', 'renovate-house'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    const stack = getStack(context.player)
    if (stack.length === 0) return

    // Offer a discount of the topmost resource
    const topResource = stack[stack.length - 1]!
    return { costs: { [topResource]: -1 } }
  },
}

registerCardListener(computeCostsListener)

/**
 * After paying for construct/improvement/renovate: remove the top resource from stack
 * if a discount was applied.
 */
const afterPayListener: CardListenerRegistration = {
  id: 'E123-resource-hoarder-after-pay',
  cardIds: [CARD_ID],
  phases: ['after' as ActionHookPhase],
  actions: ['construct', 'improvement-any', 'minor-improvement', 'renovate-house'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    const stack = getStack(context.player)
    if (stack.length === 0) return

    // Pop the top resource from the stack (it was used as a discount)
    stack.pop()
    updateInfobox(context.player)
  },
}

registerCardListener(afterPayListener)

export const E123_ResourceHoarder = new Occupation({
  id: CARD_ID,
  name: 'Resource Hoarder',
  deck: 'E',
  number: 123,
  desc: ['Pile resources as depicted on this card. You can use the top item(s) when building a room, playing/building an improvement, or renovating. (From bottom to top: <STONE>, <CLAY>, <STONE>, <REED>, <WOOD>, <CLAY>)'],
  cost: {},
  players: '1+',
})
