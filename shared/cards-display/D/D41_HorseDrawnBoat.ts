import { MinorImprovement } from '../types'

const CARD_ID = 'D41_HorseDrawnBoat'

export const D41_HorseDrawnBoat = new MinorImprovement({
  id: CARD_ID,
  name: 'Horse-Drawn Boat',
  deck: 'D',
  number: 41,
  category: 'GOODS_PROVIDER',
  desc: ['Alternate placing 1 <FOOD> and 1 <SHEEP> on each remaining round space, starting with <FOOD>. At the start of these rounds, you get the respective good.'],
  cost: { wood: 2 },
  prerequisite: '3 Occupations',
  occupationPrerequisites: { min: 3 },
})
