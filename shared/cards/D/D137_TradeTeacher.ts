import { defineOccupationCard } from '../card-source'
import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import type { ActionFlow, Resource } from '../../contract/types'
import type { CardImpl } from '../registry'
import { isLessonsSpaceId } from '../helpers/lessons-spaces'

const CARD_ID = 'D137_TradeTeacher'

/**
 * D137 Trade Teacher (Occupation, D, 137):
 * - Each time after you use a Lessons action space, you can buy up to 2 DIFFERENT
 *   goods: grain / stone / sheep / pig = 1 food each; cattle / vegetable = 2 food
 *   each.
 *
 * BGA (D137_TradeTeacher.php):
 * - isListeningTo: PlaceFarmer && actionCardType == 'Lessons'
 * - onPlayerAfterPlaceFarmer: return optional SPECIAL_EFFECT which, after
 *   multi-select UI, calls payGainNode(food cost, gained goods) and inserts it.
 *
 * Implementation:
 * - registerCardListener on place-farmer `after`, filter by space id in
 *   lessons action spaces.
 * - Return optional XOR over the full set of "valid selections" = 6 singles +
 *   15 unordered pairs of distinct goods. Each option is a SEQ of pay +
 *   per-good gain leaves.
 * - This naturally enforces the "up to 2 different" constraint via the
 *   pre-enumeration, avoiding the need for dynamic multi-select infrastructure.
 */

type GoodKey = 'grain' | 'stone' | 'sheep' | 'boar' | 'cattle' | 'vegetable'

const GOOD_COST: Record<GoodKey, number> = {
  grain: 1,
  stone: 1,
  sheep: 1,
  boar: 1,
  cattle: 2,
  vegetable: 2,
}

const GOOD_KEYS: GoodKey[] = ['grain', 'stone', 'sheep', 'boar', 'cattle', 'vegetable']

const makeComboOption = (goods: GoodKey[]): ActionFlow => {
  const totalCost = goods.reduce((acc, g) => acc + GOOD_COST[g], 0)
  const gains: Partial<Resource> = {}
  for (const g of goods) gains[g] = 1
  return {
    type: 'seq',
    choiceLabelKey: 'ui.interactionTradeTeacherBuy',
    choiceLabelParams: {
      goods: goods.join('+'),
      food: totalCost,
    },
    children: [
      {
        type: 'leaf',
        actionId: 'pay',
        sourceCard: CARD_ID,
        params: { food: totalCost },
      },
      {
        type: 'leaf',
        actionId: 'gain',
        sourceCard: CARD_ID,
        params: gains,
      },
    ],
  }
}

const buildBuyFlow = (): ActionFlow => {
  const children: ActionFlow[] = []
  // Singles
  for (const g of GOOD_KEYS) {
    children.push(makeComboOption([g]))
  }
  // Distinct pairs
  for (let i = 0; i < GOOD_KEYS.length; i += 1) {
    for (let j = i + 1; j < GOOD_KEYS.length; j += 1) {
      children.push(makeComboOption([GOOD_KEYS[i]!, GOOD_KEYS[j]!]))
    }
  }
  return {
    type: 'xor',
    optional: true,
    children,
  }
}

const listener: CardListenerRegistration = {
  id: 'D137-trade-teacher-after-lessons',
  cardIds: [CARD_ID],
  phases: ['after' as ActionHookPhase],
  actions: ['place-farmer'],
  scope: 'player',
  handler: (context: CardListenerContext): ActionHookResult | void => {
    const spaceId = context.space?.id
    if (!isLessonsSpaceId(spaceId)) return

    return {
      flow: buildBuyFlow(),
      sourceCard: CARD_ID,
    }
  },
}

const cardImpl = {
  listeners: [listener],
  reaches: [] as readonly string[],
} satisfies CardImpl

export const D137_TradeTeacher = defineOccupationCard({
  meta: {
    id: CARD_ID,
    name: "Trade Teacher",
    deck: "D",
    number: 137,
    category: "GOODS_PROVIDER",
    desc: ["Each time after you use a __Lessons__ action space, you can buy up to 2 different goods: <GRAIN>, <STONE>, <SHEEP>, and <PIG> for 1 <FOOD> each; <CATTLE> and <VEGETABLE> for 2 <FOOD> each."],
    cost: {},
    players: "3+",
  },
  impl: cardImpl,
})

export const D137_TradeTeacher_impl = D137_TradeTeacher.impl
