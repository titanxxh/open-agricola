import { Occupation } from '../types'

const CARD_ID = 'E150_RockBeater'

export const E150_RockBeater = new Occupation({
  id: CARD_ID,
  name: 'Rock Beater',
  deck: 'E',
  number: 150,
  category: 'ACTION',
  desc: [
    'You can use an action space providing both stone and a different building resource even if it is occupied by another player. Stone rooms cost you 2 <STONE> less each.',
  ],
  cost: {},
  players: '4+',
})
