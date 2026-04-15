import { MinorImprovement } from '../types'

const CARD_ID = 'D69_SmallGreenhouse'

// BGA: Add 4 and 7 to the current round and place 1 VEGETABLE on each corresponding round space.
// At the start of these rounds, you can buy the VEGETABLE for 1 FOOD.
// TODO: "pay-to-receive" future meeples (VEGETABLEPLUS) not yet supported in TS engine.

export const D69_SmallGreenhouse = new MinorImprovement({
  id: CARD_ID,
  name: 'Small Greenhouse',
  deck: 'D',
  number: 69,
  category: 'CROP_PROVIDER',
  desc: ['Add 4 and 7 to the current round and place 1 <VEGETABLE> on each corresponding round space. At the start of these rounds, you can buy the <VEGETABLE> for 1 <FOOD>.'],
  cost: { wood: 2 },
  vp: 1,
  prerequisite: '1 Occupation',
  occupationPrerequisites: { min: 1 },
})
