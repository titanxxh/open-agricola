import { Occupation } from '../types'
import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import type { CardImpl } from '../registry'

const CARD_ID = 'D95_SiteManager'

/**
 * D95 Site Manager (Occupation, 1+ players).
 *
 * BGA (D95_SiteManager.php): When you play this card, immediately build a
 * MAJOR improvement. When paying its cost, you can replace up to 1 building
 * resource of each type with 1 FOOD each.
 *
 * We express the "up to 1 of each of {wood, clay, stone, reed} → 1 food"
 * substitution as four independent, optional `Bonus` entries emitted from the
 * `computeCosts` hook. The shared bonus expander (`computeAllBuyableCombinations`
 * + `applyOptionalBonus`) then multiplies them out into 2^4 fee variants,
 * `keepOnlyOptimals` prunes Pareto-dominated ones (e.g. "swap stone" on a
 * cost with no stone), and `buildPaymentChoiceResult` surfaces the survivors
 * as a `prompt.selectPayment` choice. The existing `sourceCards` attribution
 * thread then shows "via Site Manager" on each assisted option.
 *
 * BGA also declares `orderComputeCardCosts` (D95 before A143 / C27 / B95).
 * We intentionally do NOT implement listener ordering: our bonus expander
 * unions all orderings via Pareto-optimal enumeration, which is a strict
 * superset of any single ordering's output.
 */
const onBuyListener: CardListenerRegistration = {
  id: 'D95-site-manager-onbuy',
  cardIds: [CARD_ID],
  actions: ['play-occupation'],
  phases: ['after' as ActionHookPhase],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (context.choice !== CARD_ID) return
    return {
      flow: {
        type: 'leaf',
        actionId: 'improvement-any',
        optional: true,
        sourceCard: CARD_ID,
        actionContext: { trueAction: false },
        params: {
          types: ['major'],
        },
      },
      sourceCard: CARD_ID,
    }
  },
}

const computeCostsListener: CardListenerRegistration = {
  id: 'D95-site-manager-compute-costs',
  cardIds: [CARD_ID],
  phases: ['computeCosts' as ActionHookPhase],
  actions: ['improvement-any'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (context.actionCardId !== CARD_ID) return
    if (!context.cardId) return
    return {
      bonuses: [
        { optional: true, discount: { wood: 1, food: -1 }, sources: [CARD_ID] },
        { optional: true, discount: { clay: 1, food: -1 }, sources: [CARD_ID] },
        { optional: true, discount: { stone: 1, food: -1 }, sources: [CARD_ID] },
        { optional: true, discount: { reed: 1, food: -1 }, sources: [CARD_ID] },
      ],
    }
  },
}

export const D95_SiteManager = new Occupation({
  id: CARD_ID,
  name: 'Site Manager',
  deck: 'D',
  number: 95,
  category: 'ACTIONS_BOOSTER',
  desc: [
    'When you play this card, immediately build a major improvement. When paying its cost, you can replace up to 1 building resource of each type with 1 <FOOD> each.',
  ],
  cost: {},
  players: '1+',
  evenMoreSet: true,
})

export const D95_SiteManager_impl = {
  listeners: [onBuyListener, computeCostsListener],
  reaches: [] as readonly string[],
} satisfies CardImpl
