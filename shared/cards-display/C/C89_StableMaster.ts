import { Occupation } from '../types'

const CARD_ID = 'C89_StableMaster'

export const C89_StableMaster = new Occupation({
  id: CARD_ID,
  name: 'Stable Master',
  deck: 'C',
  number: 89,
  category: 'FARM_PLANNER',
  desc: ['When you play this card, you can immediately build exactly 1 stable for 1 <WOOD>. Exactly one of your unfenced stables can hold up to 3 animals of one type.'],
  cost: {},
  players: '1+',
})
