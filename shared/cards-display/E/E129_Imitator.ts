import { Occupation } from '../types'

const CARD_ID = 'E129_Imitator'

export const E129_Imitator = new Occupation({
  id: CARD_ID,
  name: 'Imitator',
  deck: 'E',
  number: 129,
  category: 'ACTION',
  desc: ['If you have a person on the __Day Laborer__ action space, you can use non-accumulating round 1-9 action spaces even if they are occupied.'],
  cost: {},
  players: '3+',
})
