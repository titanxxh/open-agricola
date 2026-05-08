import { Occupation } from '../types'

const CARD_ID = 'E115_SeedServant'

export const E115_SeedServant = new Occupation({
  id: CARD_ID,
  name: 'Seed Servant',
  deck: 'E',
  number: 115,
  category: 'CROPS_-_SOWING',
  desc: ['Each time after you use the __Grain Seeds__ action space, you can take a __Bake bread__ action. Each time after you use the __Vegetable Seeds__ action space, you can take a __Sow__ action.'],
  cost: {},
  players: '1+',
})
