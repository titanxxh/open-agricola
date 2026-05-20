import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import type { Bonus } from '../../contract/types'
import { writeCardInfobox } from '../helpers/card-state'
import type { CardImpl } from '../registry'
import { E123_ResourceHoarder } from '../../cards-display/E/E123_ResourceHoarder'

const CARD_ID = E123_ResourceHoarder.id

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
 * offer use-top-k discounts (k=0..N) as a single Bonus with N+1 BonusChoice entries.
 *
 * BGA full alignment (Sprint 7b1 Task 2.9): k=0 means "skip" (zero discount),
 * k=N means "use the entire stack". The afterPay listener pops the chosen
 * count from the top of the stack via `bonusChoiceIndex[CARD_ID]`.
 */
const computeCostsListener: CardListenerRegistration = {
  id: 'E123-resource-hoarder-compute-costs',
  cardIds: [CARD_ID],
  phases: ['computeCosts' as ActionHookPhase],
  actions: ['construct', 'improvement', 'renovate-house'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    const stack = getStack(context.player)
    const N = stack.length
    if (N === 0) return

    const choices = []
    for (let k = 0; k <= N; k++) {
      const discount: Partial<Record<string, number>> = {}
      // top k items: indices stack.length-1 .. stack.length-k
      for (let i = 0; i < k; i++) {
        const res = stack[stack.length - 1 - i]!
        discount[res] = (discount[res] ?? 0) + 1
      }
      choices.push({ discount: discount as import('../../contract/types').BonusChoice['discount'] })
    }
    const bonus: Bonus = {
      choices,
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
 * 7b1 migration: dual-path listener.
 * - `actions: ['pay']` is the new path (improvement-any flow's pay leaf
 *   triggers it via the after phase). Reads `context.result.extraData.bonusUsed`
 *   from the pay leaf's transparent extra data.
 * - `actions: ['construct', 'renovate-house']` is the legacy path (those
 *   action definitions still call `executePaymentSolution` directly). Reads
 *   `player._activeActionBonusSources` populated by that helper.
 *
 * Both paths gate on "this card's BonusModifier.sources actually fired"
 * — the canonical signal that the discount was applied. Top-1 simplification
 * preserved here; full BGA use-top-k upgrade is deferred to Task 2.9.
 */
const afterPayListener: CardListenerRegistration = {
  id: 'E123-resource-hoarder-after-pay',
  cardIds: [CARD_ID],
  phases: ['after' as ActionHookPhase],
  actions: ['pay', 'construct', 'renovate-house'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    const stack = getStack(context.player)
    if (stack.length === 0) return
    const payment = context.eventQuery.find('resource.paid', (event) =>
      event.bonusSources?.includes(CARD_ID) === true,
    )
    if (!payment) return
    const k = payment.bonusChoiceIndex?.[CARD_ID] ?? 1
    if (k <= 0) return

    const popCount = Math.min(k, stack.length)
    stack.length = stack.length - popCount
    updateInfobox(context.player)
  },
}

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
