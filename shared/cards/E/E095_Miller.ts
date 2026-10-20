import { defineOccupationCard } from '../card-source'
import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookResult } from '../../actions/hooks'
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
 * Part 2: opponent listener — bake bread when opponent uses grain-seeds.
 */
const opponentGrainSeedsListener: CardListenerRegistration = {
  id: 'E95-miller-opponent-grain-seeds',
  cardIds: [CARD_ID],
  actionSpaces: 'all',
  phases: ['after'],
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
  effect: {
    id: CARD_ID,
    onBuy: () => ({
      type: 'leaf',
      actionId: 'improvement',
      optional: true,
      sourceCard: CARD_ID,
      actionContext: { trueAction: false },
      params: { types: ['major', 'minor'], allowedPurchases: BAKING_IMPROVEMENT_IDS },
    }),
  },
  listeners: [opponentGrainSeedsListener],
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
