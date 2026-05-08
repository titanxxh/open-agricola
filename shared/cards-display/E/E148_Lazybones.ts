import { Occupation } from '../types'

const CARD_ID = 'E148_Lazybones'

export const E148_Lazybones = new Occupation({
  id: CARD_ID,
  name: 'Lazybones',
  deck: 'E',
  number: 148,
  desc: ['Place (up to) 1 <STABLE> each on __Grain Seeds__, __Farmland__, __Day Laborer__, and __Farm Expansion__. Build the <STABLE> at no cost when another player uses that action space.'],
  cost: {},
  players: '4+',
})
