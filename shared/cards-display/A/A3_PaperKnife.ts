import { MinorImprovement } from '../types'

const CARD_ID = 'A3_PaperKnife'

export const A3_PaperKnife = new MinorImprovement({
  id: CARD_ID,
  name: 'Paper Knife',
  deck: 'A',
  number: 3,
  category: 'ACTIONS_BOOSTER',
  desc: [
    'Select 3 occupations in your hand. Select one of them randomly, which you can play immediately without paying an occupation cost.',
  ],
  cost: { wood: 1 },
  prerequisite: '3 Occupations In Hand',
})
