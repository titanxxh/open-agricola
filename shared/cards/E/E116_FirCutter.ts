import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { gainLeaf } from '../helpers/pay-gain-node'
import { familySize, workersAvailable } from '../../domain/player'
import type { CardImpl } from '../registry'
import { E116_FirCutter } from '../../cards-display/E/E116_FirCutter'

const CARD_ID = E116_FirCutter.id

/**
 * E116 Fir Cutter:
 * When you play this card, you immediately get 1 food.
 * Each time after you use an animal accumulation space (sheep-market,
 * pig-market, cattle-market) with your 1st/2nd/3rd/4th/5th person,
 * you get 1/1/2/2/3 wood.
 *
 * BGA: onBuy → gain 1 food.
 *      isListeningTo → PlaceFarmer on SheepMarket/PigMarket/CattleMarket.
 *      onPlayerAfterPlaceFarmer → map = [null, 1, 1, 2, 2, 3], gain wood[countPlacedFarmers].
 *
 * countPlacedFarmers = familySize - workersAvailable (after placing the current farmer).
 *
 * Occupation onBuy flows must use a occupation listener.
 */
const ANIMAL_MARKET_SPACES = new Set(['sheep-market', 'pig-market', 'cattle-market'])

const WOOD_BY_PLACEMENT = [0, 1, 1, 2, 2, 3]

const onBuyListener: CardListenerRegistration = {
  id: 'E116-fir-cutter-onbuy',
  cardIds: [CARD_ID],
  actions: ['occupation'],
  phases: ['after' as ActionHookPhase],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (context.choice !== CARD_ID) return
    return { flow: gainLeaf(CARD_ID, { food: 1 }), sourceCard: CARD_ID }
  },
}

const animalMarketListener: CardListenerRegistration = {
  id: 'E116-fir-cutter-after-animal-market',
  cardIds: [CARD_ID],
  phases: ['after' as ActionHookPhase],
  actions: ['place-farmer'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (!context.space || !ANIMAL_MARKET_SPACES.has(context.space.id)) return

    // Number of placed farmers = familySize - workersAvailable
    // At this point the current farmer has already been placed, so workersAvailable is decremented
    const placedFarmers = familySize(context.player) - workersAvailable(context.state, context.player)
    const woodAmount = WOOD_BY_PLACEMENT[placedFarmers] ?? WOOD_BY_PLACEMENT[WOOD_BY_PLACEMENT.length - 1]!
    if (!woodAmount || woodAmount <= 0) return

    return { flow: gainLeaf(CARD_ID, { wood: woodAmount }), sourceCard: CARD_ID }
  },
}

export const E116_FirCutter_impl = {
  listeners: [onBuyListener, animalMarketListener],
  reaches: [] as readonly string[],
} satisfies CardImpl
