import { Occupation } from '../types'
import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import type { Bonus } from '../../game/types'
import { writeCardInfobox } from '../helpers/card-state'
import type { CardImpl } from '../registry'

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

/**
 * computeCosts listener: for construct, improvement-any, minor-improvement, and renovate,
 * offer a discount of the top resource from the stack as an optional bonus.
 *
 * Simplified vs BGA: BGA emits N choices (use top 0..N items). We emit a single
 * optional choice for the top item only (deliberate divergence — see card_progress.md
 * §2.5). Using the bonus framework (vs flat `costs`) routes through
 * paymentSolution and populates `_activeActionBonusSources` so the after-pay
 * listener pops only when the bonus actually fired.
 */
const computeCostsListener: CardListenerRegistration = {
  id: 'E123-resource-hoarder-compute-costs',
  cardIds: [CARD_ID],
  phases: ['computeCosts' as ActionHookPhase],
  actions: ['construct', 'improvement-any', 'minor-improvement', 'renovate-house'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    const stack = getStack(context.player)
    if (stack.length === 0) return

    const topResource = stack[stack.length - 1]!
    const bonus: Bonus = {
      discount: { [topResource]: 1 },
      optional: true,
      sources: [CARD_ID],
    }
    return { bonuses: [bonus] }
  },
}

/**
 * After paying for construct/improvement/renovate: remove the top resource from
 * stack ONLY when this card's bonus actually fired during the payment.
 *
 * Bug fix: previously the listener popped unconditionally, so any
 * construct/improvement/renovate would drain the stack even when the cost did
 * not include the top resource (i.e., the bonus was rejected by the payment
 * solver). We gate on `player._activeActionBonusSources` — populated by
 * `executePaymentSolution` with bonus.sources of solutions that were used —
 * which is the canonical "this card's bonus was actually applied" signal.
 */
const afterPayListener: CardListenerRegistration = {
  id: 'E123-resource-hoarder-after-pay',
  cardIds: [CARD_ID],
  phases: ['after' as ActionHookPhase],
  actions: ['construct', 'improvement-any', 'minor-improvement', 'renovate-house'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    const stack = getStack(context.player)
    if (stack.length === 0) return
    const sources = context.player._activeActionBonusSources ?? []
    if (!sources.includes(CARD_ID)) return

    // Pop the top resource from the stack (it was used as a discount)
    stack.pop()
    updateInfobox(context.player)
  },
}

export const E123_ResourceHoarder = new Occupation({
  id: CARD_ID,
  name: 'Resource Hoarder',
  deck: 'E',
  number: 123,
  desc: ['Pile resources as depicted on this card. You can use the top item(s) when building a room, playing/building an improvement, or renovating. (From bottom to top: <STONE>, <CLAY>, <STONE>, <REED>, <WOOD>, <CLAY>)'],
  cost: {},
  players: '1+',
})

export const E123_ResourceHoarder_impl = {
  listeners: [computeCostsListener, afterPayListener],
  effect: {
  id: CARD_ID,
  onBuy: (_state, player) => {
    if (!player.cardStates) player.cardStates = {}
    if (!player.cardStates[CARD_ID]) player.cardStates[CARD_ID] = {}
    // Store stack bottom-to-top
    player.cardStates[CARD_ID]!.stack = [...INITIAL_STACK]
    updateInfobox(player)
  },
},
  reaches: [] as readonly string[],
} satisfies CardImpl
