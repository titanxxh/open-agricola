import { Occupation } from '../types'

const CARD_ID = 'E120_ScrapCollector'

export const E120_ScrapCollector = new Occupation({
  id: CARD_ID,
  name: 'Scrap Collector',
  deck: 'E',
  number: 120,
  category: 'BUILDING_RESOURCES_-_CLAY_(AND_WOOD)',
  desc: ['Alternate placing 1 <WOOD> and 1 <CLAY> on each of the next 6 round spaces, starting with <WOOD>. At the start of these rounds, you get the respective resource.'],
  players: '1+',
})
