import { defineMinorCard } from '../card-source'
import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import type { CardCostCandidate } from '../../contract/types'
import { isCardFlagged } from '../helpers/card-state'
import { isMajorCardId } from '../helpers/card-type'
import type { CardImpl } from '../registry'

const CARD_ID = 'E27_PiggyBank'
const FOOD_KEY = 'food'

const FOOD_THRESHOLD = 6

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
          { type: 'leaf', actionId: 'special-effect', sourceCard: CARD_ID, params: { kind: 'set-flag', flag: true } },
          // Move 6 food from card counter to player supply, then discard
          {
            type: 'leaf',
            actionId: 'take-from-card',
            params: { [FOOD_KEY]: FOOD_THRESHOLD },
            sourceCard: CARD_ID,
          },
          {
            type: 'leaf',
            actionId: 'pay',
            params: { food: FOOD_THRESHOLD },
            sourceCard: CARD_ID,
          },
          // Build a free major improvement
          {
            type: 'leaf',
            actionId: 'improvement',
            sourceCard: CARD_ID,
            actionContext: { types: ['major'], trueAction: false },
          },
          // Unflag card
          { type: 'leaf', actionId: 'special-effect', sourceCard: CARD_ID, params: { kind: 'set-flag', flag: false } },
        ],
      },
      sourceCard: CARD_ID,
      labelKey: 'cards.E27_PiggyBank.anytime',
    }
  },
}

/**
 * After store-on-card / take-from-card: refresh infobox to "n / 6" so the
 * player can see how close they are to triggering the free-major payoff.
 */
const updateInfoboxListener: CardListenerRegistration = {
  id: 'E27-piggy-bank-after-store',
  cardIds: [CARD_ID],
  phases: ['after' as ActionHookPhase],
  actions: ['store-on-card', 'take-from-card'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    const food = context.player.cardStates?.[CARD_ID]?.counters?.[FOOD_KEY] ?? 0
    return {
      flow: {
        type: 'leaf',
        actionId: 'special-effect',
        sourceCard: CARD_ID,
        params: { kind: 'set-infobox', text: `${food} / ${FOOD_THRESHOLD}` },
      },
      sourceCard: CARD_ID,
    }
  },
}

/**
 * computeCosts listener: when card is flagged, zero out costs for major improvements.
 */
const computeCostsListener: CardListenerRegistration = {
  id: 'E27-piggy-bank-compute-costs',
  cardIds: [CARD_ID],
  phases: ['computeCosts' as ActionHookPhase],
  actions: ['improvement'],
  order: 100,
  computeCardCostCandidates: (context: CardListenerContext, candidates: readonly CardCostCandidate[]) => {
    if (!isCardFlagged(context.player, CARD_ID)) return [...candidates]
    if (!context.cardId || !isMajorCardId(context.cardId)) return [...candidates]
    return [
      ...candidates,
      ...candidates.map((candidate) => ({
        resources: {},
        originalFeeIndex: candidate.originalFeeIndex,
        sources: [...candidate.sources, CARD_ID],
      })),
    ]
  },
}

const cardImpl = {
  listeners: [anytimeListener, computeCostsListener, updateInfoboxListener],
  effect: {
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
          actionId: 'pay',
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
},
  reaches: [] as readonly string[],
} satisfies CardImpl

export const E27_PiggyBank = defineMinorCard({
  meta: {
    id: CARD_ID,
    name: 'Piggy Bank',
    deck: 'E',
    number: 27,
    desc: ['At the end of each work phase, you can place 1 <FOOD> on this card, irretrievably. At any time, you can discard 6 <FOOD> from this card to build a major improvement at no cost.'],
    cost: {},
    category: 'ACTION_-_IMPROVEMENT',
  },
  impl: cardImpl,
})

export const E27_PiggyBank_impl = E27_PiggyBank.impl
