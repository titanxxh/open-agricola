import { Occupation } from '../types'

const CARD_ID = 'E149_MidnightFencer'

export const E149_MidnightFencer = new Occupation({
  id: CARD_ID,
  name: 'Midnight Fencer',
  deck: 'E',
  number: 149,
  desc: ["At the start of the last harvest, you can take up to 2 of each other player's unbuilt fences and build them on your farm at no cost. (Your farm can then have over 15 fences.)"],
  cost: {},
  players: '4+',
})
