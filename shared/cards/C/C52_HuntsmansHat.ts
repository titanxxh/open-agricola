import { MinorImprovement } from '../types'
import type { CardListenerContext, CardListenerRegistration } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { gainLeaf } from '../helpers/pay-gain-node'
import type { CardImpl } from '../registry'

const CARD_ID = 'C52_HuntsmansHat'

/**
 * C52 Huntsman's Hat — For each new pig you get from the effect of an action
 * space, you also get 1 food.
 *
 * BGA: `isListeningTo` matches any Gain event with `fromActionSpace` true,
 * and `onPlayerAfterGain` sums obtained PIG meeples → emits gainNode([FOOD => N]).
 * BGA also modifies the AnimalMarket placeFarmerFlow (sheep+food xor
 * boar+food xor pay-food→cattle) — NOT implemented since we have no
 * AnimalMarket action space (registered as §2.5 simplification).
 *
 * Implementation: generic listener on `phase: 'after'` for the union of
 * `gain` / `collect` / `receive` actions (mirrors E53 BoarSpear pattern).
 * Reads `result.resourcesGained.boar` and emits 1 food per boar gained.
 */
const TRACKED_ACTIONS = ['gain', 'collect', 'receive'] as const

const huntsmansHatListener: CardListenerRegistration = {
  id: 'C52-huntsmans-hat-after-boar-gain',
  cardIds: [CARD_ID],
  phases: ['after' as ActionHookPhase],
  actions: [...TRACKED_ACTIONS],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (!(TRACKED_ACTIONS as readonly string[]).includes(context.actionId)) return
    const result = context.result
    const gained = result?.type === 'ok' ? (result.resourcesGained?.boar ?? 0) : 0
    if (gained <= 0) return
    return {
      flow: gainLeaf(CARD_ID, { food: gained }),
      sourceCard: CARD_ID,
    }
  },
}

export const C52_HuntsmansHat = new MinorImprovement({
  id: CARD_ID,
  name: "Huntsman's Hat",
  deck: "C",
  number: 52,
  category: "FOOD_PROVIDER",
  desc: ["For each new <PIG> you get from the effect of an action space, you also get 1 <FOOD>."],
  vp: 1,
  cost: { reed: 1 },
  prerequisite: "Cooking Improvement",
  newSet: true,
})

export const C52_HuntsmansHat_impl = {
  listeners: [huntsmansHatListener],
  reaches: [] as readonly string[],
} satisfies CardImpl
