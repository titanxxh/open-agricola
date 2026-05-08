import { Occupation } from '../types'

const CARD_ID = 'C129_SecondSpouse'

export const C129_SecondSpouse = new Occupation({
  id: CARD_ID,
  name: 'Second Spouse',
  deck: 'C',
  number: 129,
  category: 'ACTIONS_BOOSTER',
  desc: [
    'You can use the __Urgent Wish for Children__ action space (from round 12-13) even if it is occupied by the first person another player placed.',
  ],
  cost: {},
  players: '3+',
})
