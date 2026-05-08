import { Occupation } from '../types'

const CARD_ID = 'B167_StableSergeant'

export const B167_StableSergeant = new Occupation({
  id: CARD_ID,
  name: 'Stable Sergeant',
  deck: 'B',
  number: 167,
  category: 'LIVESTOCK_PROVIDER',
  desc: ['When you play this card, you can pay 2 <FOOD> to get 1 <SHEEP>, 1 <PIG>, and 1 <CATTLE>, but only if you can accommodate all three animals on your farm.'],
  cost: {},
  players: '4+',
})
