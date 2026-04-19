import { MinorImprovement } from '../types'
import { registerCardEffect } from '../card-effects'
import { registerCardListener } from '../card-listeners'
import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { isCardFlagged } from '../helpers/card-state'

const CARD_ID = 'E27_PiggyBank'
const FOOD_KEY = 'food'
const FOOD_THRESHOLD = 6

/**
 * E27 Piggy Bank (Minor Improvement, E, 27)
 * At the end of each work phase, you can place 1 food on this card, irretrievably.
 * At any time, you can discard 6 food from this card to build a major improvement
 * at no cost.
 *
 * BGA: EndWorkPhase → place 1 food on card (optional).
 * Anytime → if 6+ food on card, discard 6 and build a free major.
 * onPlayerComputeCardCosts → when flagged, zero out all major improvement costs.
 */

registerCardEffect({
  id: CARD_ID,
  onBeforeReturnHome: (_state, player) => {
    if ((player.resources.food ?? 0) < 1) return

    // Offer to place 1 food on card (pay 1 food from supply, store on card counter)
    return {
      type: 'seq',
      optional: true,
      children: [
        {
          type: 'leaf',
          actionId: 'pay-resources',
          params: { food: 1 },
          sourceCard: CARD_ID,
        },
        {
          type: 'leaf',
          actionId: 'store-on-card',
          params: { [FOOD_KEY]: 1 },
          sourceCard: CARD_ID,
        },
      ],
    }
  },
})

/**
 * Anytime listener: when 6+ food on card, offer to discard 6 and build a free major.
 * Uses flag to communicate with computeCosts listener.
 */
const anytimeListener: CardListenerRegistration = {
  id: 'E27-piggy-bank-anytime',
  cardIds: [CARD_ID],
  phases: ['anytime' as ActionHookPhase],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    const foodOnCard = context.player.cardStates?.[CARD_ID]?.counters?.[FOOD_KEY] ?? 0
    if (foodOnCard < FOOD_THRESHOLD) return
    if (isCardFlagged(context.player, CARD_ID)) return

    return {
      flow: {
        type: 'seq',
        children: [
          // Flag card so computeCosts zeroes out major costs
          { type: 'leaf', actionId: 'flag-card', sourceCard: CARD_ID },
          // Move 6 food from card counter to player supply, then discard
          {
            type: 'leaf',
            actionId: 'take-from-card',
            params: { [FOOD_KEY]: FOOD_THRESHOLD },
            sourceCard: CARD_ID,
          },
          {
            type: 'leaf',
            actionId: 'pay-resources',
            params: { food: FOOD_THRESHOLD },
            sourceCard: CARD_ID,
          },
          // Build a free major improvement
          {
            type: 'leaf',
            actionId: 'improvement-any',
            sourceCard: CARD_ID,
            actionContext: { trueAction: false },
          },
          // Unflag card
          { type: 'leaf', actionId: 'unflag-card', sourceCard: CARD_ID },
        ],
      },
      sourceCard: CARD_ID,
      labelKey: 'cards.E27_PiggyBank.anytime',
    }
  },
}

registerCardListener(anytimeListener)

/**
 * computeCosts listener: when card is flagged, zero out costs for major improvements.
 */
const computeCostsListener: CardListenerRegistration = {
  id: 'E27-piggy-bank-compute-costs',
  cardIds: [CARD_ID],
  phases: ['computeCosts' as ActionHookPhase],
  actions: ['improvement-any'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (!isCardFlagged(context.player, CARD_ID)) return
    // When flagged, the improvement is free — zero out all costs
    return { costs: { wood: -99, clay: -99, reed: -99, stone: -99, food: -99 } }
  },
}

registerCardListener(computeCostsListener)

export const E27_PiggyBank = new MinorImprovement({
  id: CARD_ID,
  name: 'Piggy Bank',
  deck: 'E',
  number: 27,
  desc: ['At the end of each work phase, you can place 1 <FOOD> on this card, irretrievably. At any time, you can discard 6 <FOOD> from this card to build a major improvement at no cost.'],
  cost: {},
})
