import { Occupation } from '../types'

const CARD_ID = 'E123_ResourceHoarder'

export const E123_ResourceHoarder = new Occupation({
  id: CARD_ID,
  name: 'Resource Hoarder',
  deck: 'E',
  number: 123,
  desc: ['Pile resources as depicted on this card. You can use the top item(s) when building a room, playing/building an improvement, or renovating. (From bottom to top: <STONE>, <CLAY>, <STONE>, <REED>, <WOOD>, <CLAY>)'],
  cost: {},
  players: '1+',
})
