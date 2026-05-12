import { Occupation } from '../types'

const CARD_ID = 'B154_SheepKeeper'

export const B154_SheepKeeper = new Occupation({
  id: CARD_ID,
  name: 'Sheep Keeper',
  deck: 'B',
  number: 154,
  category: 'POINTS_PROVIDER',
  desc: ['You can only play this card if you have less than 7 <SHEEP>. Once this game, when you have 7 <SHEEP> on your farm, you immediately get 3 bonus <SCORE> and 2 <FOOD>.'],
  cost: {},
  players: '4+',
  prerequisite: 'Less Than 7 Sheep',
  extraVp: true,
})
