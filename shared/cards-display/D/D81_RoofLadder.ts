import { MinorImprovement } from '../types'

const CARD_ID = 'D81_RoofLadder'

export const D81_RoofLadder = new MinorImprovement({
  id: CARD_ID,
  name: 'Roof Ladder',
  deck: 'D',
  number: 81,
  category: 'BUILDING_RESOURCE_PROVIDER',
  desc: [
    'Each time you renovate, you pay 1 fewer <REED> and, at the end of the action, you get 1 <STONE>.',
  ],
  cost: { wood: 1 },
})
