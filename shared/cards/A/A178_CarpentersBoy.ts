import { Occupation } from '../../cards-display/types'

export const A178_CarpentersBoy = new Occupation({
  id: 'A178_CarpentersBoy',
  name: "Carpenter's Boy",
  deck: 'A',
  number: 178,
  category: 'BUILDING_RESOURCE_PROVIDER',
  desc: ['Each time another player builds a room, you immediately get 1 wood.'],
  cost: {},
  players: '5+',
})
