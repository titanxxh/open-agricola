import { Occupation } from '../types'
import { registerCardListener } from '../card-listeners'
import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'

const CARD_ID = 'E95_Miller'

/**
 * List of baking-related improvements that the Miller can purchase onBuy.
 * Matches BGA reference (E95_Miller.php allowedPurchases).
 */
const BAKING_IMPROVEMENT_IDS = [
  'Major_Fireplace1',
  'Major_Fireplace2',
  'Major_CookingHearth1',
  'Major_CookingHearth2',
  'Major_ClayOven',
  'Major_StoneOven',
  'D59_EarthOven',
  'A60_OrientalFireplace',
  'D25_WitchesDanceFloor',
  'D64_BakingCourse',
  'E63_IronOven',
  'E64_SimpleOven',
]

/**
 * Part 1: onBuy — when Miller is played, optionally purchase a baking improvement.
 *
 * This uses a card listener on play-occupation (after phase) rather than
 * registerCardEffect.onBuy because the engine does not process onBuy flows
 * for occupation cards — only for improvements. Card listeners on
 * play-occupation are the standard pattern for occupation onBuy flows.
 */
const onBuyListener: CardListenerRegistration = {
  id: 'E95-miller-onbuy-improvement',
  cardIds: [CARD_ID],
  actions: ['play-occupation'],
  phases: ['after' as ActionHookPhase],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    // Only trigger when the Miller card itself was just played
    if (context.choice !== CARD_ID) return
    return {
      flow: {
        type: 'leaf',
        actionId: 'improvement-any',
        optional: true,
        sourceCard: CARD_ID,
        actionContext: { trueAction: false },
        params: {
          allowedPurchases: BAKING_IMPROVEMENT_IDS,
        } as any,
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
      logKey: 'log.cardGrantedAction',
      logParams: { cardId: CARD_ID, actionId: 'bake-bread' },
      sourceCard: CARD_ID,
    }
  },
}

registerCardListener(onBuyListener)
registerCardListener(opponentGrainSeedsListener)

export const E95_Miller = new Occupation({
  id: CARD_ID,
  name: 'Miller',
  deck: 'E',
  number: 95,
  category: 'ACTION_-_MAJOR_IMPROVEMENT',
  desc: [
    'You can immediately build a <BAKE>-improvement by paying its cost. Each time another player uses the __Grain Seeds__ action space, you can take a __Bake Bread__ action.',
  ],
  cost: { food: 1 },
  players: '1+',
})
