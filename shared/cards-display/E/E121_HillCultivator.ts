import { Occupation } from '../types'

const CARD_ID = 'E121_HillCultivator'

export const E121_HillCultivator = new Occupation({
  id: CARD_ID,
  name: 'Hill Cultivator',
  deck: 'E',
  number: 121,
  category: 'BUILDING_RESOURCES_-_CLAY',
  desc: ['Each time you use the __Grain Seeds__ or __Vegetable Seeds__ action space, you also get 2 or 3 <CLAY>, respectively.'],
  cost: {},
  players: '1+',
})
