import { Occupation } from '../types'

const CARD_ID = 'D126_FieldCultivator'

export const D126_FieldCultivator = new Occupation({
  id: CARD_ID,
  name: 'Field Cultivator',
  deck: 'D',
  number: 126,
  category: 'BUILDING_RESOURCE_PROVIDER',
  desc: ['Pile 1 <WOOD>, 1 <CLAY>, 1 <REED>, 1 <STONE>, 1 <REED>, 1 <CLAY>, and 1 <WOOD> on this card. Each time you harvest a field tile, you can also take the top good from the pile.'],
  cost: {},
  players: '1+',
  newSet: true,
})
