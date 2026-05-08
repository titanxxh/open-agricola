import { MinorImprovement } from '../types'
import type { TradeModifier } from '../../contract/types'

const CARD_ID = 'A28_ForestSchool'

const FOREST_SCHOOL_MAX_TRADES = 8

export const A28_ForestSchool = new MinorImprovement({
  id: "A28_ForestSchool",
  name: "Forest School",
  deck: "A",
  number: 28,
  category: "ACTIONS_BOOSTER",
  desc: ["You can consider the __Lessons__ action spaces not occupied. You can replace each <FOOD> that an occupation costs with <WOOD>."],
  cost: {"wood":1,"clay":1},
  vp: 1,
  newSet: true,
  modifier: {
    type: 'trade',
    cardId: CARD_ID,
    appliesTo: ['occupation'],
    from: { wood: 1 },
    to: { food: 1 },
    max: FOREST_SCHOOL_MAX_TRADES,
  } as TradeModifier,
})
