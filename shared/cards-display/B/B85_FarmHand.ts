import { Occupation } from '../types'

const CARD_ID = 'B85_FarmHand'

export const B85_FarmHand = new Occupation({
  id: CARD_ID,
  name: 'Farm Hand',
  deck: 'B',
  number: 85,
  category: 'FARM_PLANNER',
  desc: [
    'Once this game, if you have 4 field tiles in a 2x2, you can build a stable in the center of the 2x2 during a __Build Stables__ action. This stable provides room for a person but not animals.',
  ],
  players: '1+',
  implemented: true,
})
