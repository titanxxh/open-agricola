import { defineOccupationCard } from '../card-source'
import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import type { CardImpl } from '../registry'

const CARD_ID = 'E095_Miller'
/**
 * List of baking-related improvements that the Miller can purchase onBuy.
 * Matches the reference allowedPurchases.
 */
const BAKING_IMPROVEMENT_IDS = [
  'Major_Fireplace1',
  'Major_Fireplace2',
  'Major_CookingHearth1',
  'Major_CookingHearth2',
  'Major_ClayOven',
  'Major_StoneOven',
  'D059_EarthOven',
  'A060_OrientalFireplace',
  'D025_WitchesDanceFloor',
  'D064_BakingCourse',
  'E063_IronOven',
  'E064_SimpleOven',
]

/**
 * Part 1: onBuy — when Miller is played, optionally purchase a baking improvement.
 *
 * This uses a card listener on occupation (after phase) rather than
 * registerCardEffect.onBuy because the engine does not process onBuy flows
 * for occupation cards — only for improvements. Card listeners on
 * occupation are the standard pattern for occupation onBuy flows.
 */
const onBuyListener: CardListenerRegistration = {
  id: 'E95-miller-onbuy-improvement',
  cardIds: [CARD_ID],
  actions: ['occupation'],
  phases: ['after' as ActionHookPhase],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    // Only trigger when the Miller card itself was just played
    if (context.choice !== CARD_ID) return
    return {
      flow: {
        type: 'leaf',
        actionId: 'improvement',
        optional: true,
        sourceCard: CARD_ID,
        actionContext: { trueAction: false },
        params: {
          types: ['major', 'minor'],
          allowedPurchases: BAKING_IMPROVEMENT_IDS,
        },
      },
      sourceCard: CARD_ID,
    }
  },
}

/**
 * Part 2: opponent listener — bake bread when opponent uses grain-seeds.
 */
const opponentGrainSeedsListener: CardListenerRegistration = {
  id: 'E95-miller-opponent-grain-seeds',
  cardIds: [CARD_ID],
  actions: ['place-farmer'],
  phases: ['after' as ActionHookPhase],
  scope: 'opponent',
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (context.space?.id !== 'grain-seeds') return
    return {
      flow: {
        type: 'leaf',
        actionId: 'bake-bread',
        optional: true,
        sourceCard: CARD_ID,
        actionContext: { trueAction: false },
      },
      sourceCard: CARD_ID,
    }
  },
}

const cardImpl = {
  listeners: [onBuyListener, opponentGrainSeedsListener],
  reaches: [] as readonly string[],
} satisfies CardImpl

export const E095_Miller = defineOccupationCard({
  meta: {
    id: CARD_ID,
    name: 'Miller',
    deck: 'E',
    number: 95,
    category: 'ACTION_-_MAJOR_IMPROVEMENT',
    desc: [
        'You can immediately build a <BAKE>-improvement by paying its cost. Each time another player uses the __Grain Seeds__ action space, you can take a __Bake Bread__ action.',
      ],
    cost: {},
    players: '1+',
  },
  impl: cardImpl,
})

export const E095_Miller_impl = E095_Miller.impl
