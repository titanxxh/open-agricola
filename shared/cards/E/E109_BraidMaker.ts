import { Occupation } from '../types'
import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import type { CardImpl } from '../registry'

const CARD_ID = 'E109_BraidMaker'

/**
 * E109 Braid Maker (Occupation, 1+ players).
 *
 * BGA (E109_BraidMaker.php):
 *   - exchanges: each harvest, 1 REED → 2 FOOD (max 1).
 *   - onPlayerComputeCardCosts: whenever buying Major_Basket (regardless of
 *     trigger), override trades to cost { stone: 1, reed: 1 }.
 *
 * Implementation:
 *   - exchanges field on the card definition handles the harvest reed → food.
 *   - computeCosts listener on improvement-any keyed off context.cardId ===
 *     Major_Basket → applies delta that reduces base cost { reed: 2, stone: 2 }
 *     to { reed: 1, stone: 1 }. No flag / actionCardId gate — BGA applies it
 *     any time this card is owned.
 *   - BGA uses orderComputeCardCosts to sort this before Stonecutter /
 *     Blueprint / MasterBricklayer because those can do trade-absolute-assignment
 *     variants. Our implementation emits deltas (commutative addition), so
 *     order is a no-op. See shared/actions/hooks.ts ActionHookRegistration.order
 *     for details.
 */

const computeCostsListener: CardListenerRegistration = {
  id: 'E109-braid-maker-compute-costs-basket',
  cardIds: [CARD_ID],
  phases: ['computeCosts' as ActionHookPhase],
  actions: ['improvement-any', 'minor-improvement'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (context.cardId !== 'Major_Basket') return
    // Base cost is { reed: 2, stone: 2 } → reduce to { reed: 1, stone: 1 }.
    return { costs: { stone: -1, reed: -1 } }
  },
}

export const E109_BraidMaker = new Occupation({
  id: CARD_ID,
  name: 'Braid Maker',
  deck: 'E',
  number: 109,
  category: 'FOOD',
  desc: [
    "Each harvest, you can use this card to exchange 1 <REED> for 2 <FOOD>. You can build the  __Basketmaker's Workshop__ for 1 <REED> and 1 <STONE> even when taking a __Minor Improvement__ action. ",
  ],
  cost: {},
  players: '1+',
  exchanges: [
    { from: { reed: 1 }, to: { food: 2 }, max: 1, trigger: 'anytime' },
  ],
})

export const E109_BraidMaker_impl = {
  listeners: [computeCostsListener],
  reaches: [] as readonly string[],
} satisfies CardImpl
