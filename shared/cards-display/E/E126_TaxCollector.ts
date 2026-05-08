import { Occupation } from '../types'

const CARD_ID = 'E126_TaxCollector'

export const E126_TaxCollector = new Occupation({
  id: CARD_ID,
  name: 'Tax Collector',
  deck: 'E',
  number: 126,
  category: 'BUILDING_RESOURCES_-_ALL',
  desc: ['Once you live in a stone house, at the start of each round, you get your choice of 2 <WOOD>, 2 <CLAY>, 1 <REED>, or 1 <STONE>.'],
  cost: {},
  players: '1+',
})
