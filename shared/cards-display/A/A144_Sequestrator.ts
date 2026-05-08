import { Occupation } from '../types'

const CARD_ID = 'A144_Sequestrator'

export const A144_Sequestrator = new Occupation({
  id: CARD_ID,
  name: "Sequestrator",
  deck: "A",
  number: 144,
  category: "BUILDING_RESOURCE_PROVIDER",
  desc: ["Place 3 <REED> and 4 <CLAY> on this card. The next player to have 3 pastures/5 field tiles gets the 3 <REED>/4 <CLAY> (not retroactively)."],
  cost: {},
  players: "3+",
  newSet: true,
})
