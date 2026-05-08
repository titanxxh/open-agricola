import { Occupation } from '../types'

const CARD_ID = 'A91_ShiftingCultivator'

export const A91_ShiftingCultivator = new Occupation({
  id: CARD_ID,
  name: 'Shifting Cultivator',
  deck: 'A',
  number: 91,
  category: 'FARM_PLANNER',
  desc: ['Each time you use a wood accumulation space, you can also pay 3 <FOOD> to plow 1 field.'],
  cost: {},
  players: '1+',
  newSet: true,
})
