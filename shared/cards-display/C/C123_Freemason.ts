import { Occupation } from '../types'

const CARD_ID = 'C123_Freemason'

export const C123_Freemason = new Occupation({
  id: CARD_ID,
  name: 'Freemason',
  deck: 'C',
  number: 123,
  category: 'BUILDING_RESOURCE_PROVIDER',
  desc: ['As long as you live in a <CLAY>/<STONE> house with exactly 2 rooms, at the start of each work phase, you get 2 <CLAY>/<STONE>.'],
  cost: {},
  players: '1+',
})
