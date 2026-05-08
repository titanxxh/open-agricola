import { Occupation } from '../types'

const CARD_ID = 'C120_AgriculturalLabourer'

export const C120_AgriculturalLabourer = new Occupation({
  id: CARD_ID,
  name: "Agricultural Labourer",
  deck: "C",
  number: 120,
  category: "BUILDING_RESOURCE_PROVIDER",
  desc: ["Place 8 <CLAY> on this card. For each <GRAIN> you obtain, you also get 1 <CLAY> from this card."],
  cost: {},
  players: "1+",
})
