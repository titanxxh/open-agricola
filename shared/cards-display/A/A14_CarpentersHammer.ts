import { MinorImprovement } from '../types'

const CARD_ID = 'A14_CarpentersHammer'

export const A14_CarpentersHammer = new MinorImprovement({
  id: CARD_ID,
  name: "Carpenter's Hammer",
  deck: "A",
  number: 14,
  category: "FARM_PLANNER",
  desc: ["Each time you build at least 2 wood/clay/stone rooms at once, you get a total discount of 2 <REED> as well as 2 <WOOD>/3 <CLAY>/4 <STONE>."],
  cost: {"wood":1},
  modifiers: [
    {
      type: 'bonus',
      cardId: CARD_ID,
      appliesTo: ['construct'],
      discount: { reed: 2 },
      optional: false,
      conditions: { minNumRooms: 2 },
    },
    {
      type: 'bonus',
      cardId: CARD_ID,
      appliesTo: ['construct'],
      discount: { wood: 2 },
      optional: false,
      conditions: { minNumRooms: 2, houseTypeWood: 1 },
    },
    {
      type: 'bonus',
      cardId: CARD_ID,
      appliesTo: ['construct'],
      discount: { clay: 3 },
      optional: false,
      conditions: { minNumRooms: 2, houseTypeClay: 1 },
    },
    {
      type: 'bonus',
      cardId: CARD_ID,
      appliesTo: ['construct'],
      discount: { stone: 4 },
      optional: false,
      conditions: { minNumRooms: 2, houseTypeStone: 1 },
    },
  ],
})
