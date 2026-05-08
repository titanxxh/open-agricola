import { MinorImprovement } from '../types'

const CARD_ID = 'E21_SheepRug'

export const E21_SheepRug = new MinorImprovement({
  id: CARD_ID,
  name: 'Sheep Rug',
  deck: 'E',
  number: 21,
  category: 'ACTION_-_FAMILY_GROWTH',
  desc: ["You can use any __Wish for Children__ action space, even if it is occupied by another player's person."],
  vp: 1,
  cost: { sheep: 1 },
  prerequisite: '4 Sheep',
})
