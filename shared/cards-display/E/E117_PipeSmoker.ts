import { Occupation } from '../types'

const CARD_ID = 'E117_PipeSmoker'

export const E117_PipeSmoker = new Occupation({
  id: CARD_ID,
  name: "Pipe Smoker",
  deck: "E",
  number: 117,
  category: "BUILDING_RESOURCES_-_WOOD",
  desc: ['At the start of each harvest, if you have at least 1 grain field, you get 2\u00a0<WOOD>.'],
  cost: {},
  players: "1+",
})
