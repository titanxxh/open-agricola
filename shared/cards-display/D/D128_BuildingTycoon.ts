import { Occupation } from '../types'

const CARD_ID = 'D128_BuildingTycoon'

export const D128_BuildingTycoon = new Occupation({
  id: CARD_ID,
  name: 'Building Tycoon',
  deck: 'D',
  number: 128,
  category: 'FARM_PLANNER',
  desc: [
    'Each time after another player builds 1 or more rooms, you can give them 1 <FOOD> to build exactly 1 room yourself. (You must pay the building cost of the room.)',
  ],
  cost: {},
  players: '3+',
})
