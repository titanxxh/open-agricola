import { Occupation } from '../types'

const CARD_ID = 'E95_Miller'

export const E95_Miller = new Occupation({
  id: CARD_ID,
  name: 'Miller',
  deck: 'E',
  number: 95,
  category: 'ACTION_-_MAJOR_IMPROVEMENT',
  desc: [
    'You can immediately build a <BAKE>-improvement by paying its cost. Each time another player uses the __Grain Seeds__ action space, you can take a __Bake Bread__ action.',
  ],
  cost: {},
  players: '1+',
})
