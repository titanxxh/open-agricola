import { Occupation } from '../types'

const CARD_ID = 'E118_KindlingGatherer'

export const E118_KindlingGatherer = new Occupation({
  id: CARD_ID,
  name: 'Kindling Gatherer',
  deck: 'E',
  number: 118,
  category: 'BUILDING_RESOURCES_-_WOOD',
  desc: ['Each time you get <FOOD> from an action space, you get 1 additional <WOOD>.'],
  cost: {},
  players: '1+',
})
