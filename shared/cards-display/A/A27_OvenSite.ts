import { MinorImprovement } from '../types'

const CARD_ID = 'A27_OvenSite'

export const A27_OvenSite = new MinorImprovement({
  id: CARD_ID,
  name: 'Oven Site',
  deck: 'A',
  number: 27,
  category: 'ACTIONS_BOOSTER',
  desc: [
    'When you play this card, you get 2 <WOOD> and you can immediately build the __Clay Oven__ or __Stone Oven__ major improvement. Either way, it only costs you 1 <CLAY> and 1 <STONE>.',
  ],
  prerequisite: 'Both Fireplace and Cooking Hearth',
  cost: {},
  newSet: true,
})
