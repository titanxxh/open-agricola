import { Occupation } from '../types'

const CARD_ID = 'D144_WaterWorker'

export const D144_WaterWorker = new Occupation({
  id: CARD_ID,
  name: 'Water Worker',
  deck: 'D',
  number: 144,
  category: 'BUILDING_RESOURCE_PROVIDER',
  desc: [
    'Each time after you use any of the __Fishing__, __Reed Bank__, __Day Laborer__ spaces or the action space of round 4, you get 1 additional <REED>.',
  ],
  cost: {},
  players: '3+',
})
