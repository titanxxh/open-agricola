import { Occupation } from '../types'

const CARD_ID = 'B143_ClayWarden'

export const B143_ClayWarden = new Occupation({
  id: CARD_ID,
  name: 'Clay Warden',
  deck: 'B',
  number: 143,
  category: 'BUILDING_RESOURCE_PROVIDER',
  desc: [
    'Each time another player uses the __Hollow__ accumulation space, you get 1 <CLAY>. In a 3-/4-player game, you also get 1 additional <CLAY>/<FOOD>.',
  ],
  cost: {},
  players: '3+',
})
