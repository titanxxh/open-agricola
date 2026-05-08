import { Occupation } from '../types'

const CARD_ID = 'E108_BlackberryFarmer'

export const E108_BlackberryFarmer = new Occupation({
  id: CARD_ID,
  name: 'Blackberry Farmer',
  deck: 'E',
  number: 108,
  category: 'FOOD',
  desc: [
    'Each time you build fences, place 1 <FOOD> on each remaining round space, up to the number of fences just built. At the start of these rounds, you get the <FOOD>.',
  ],
  cost: {},
  players: '1+',
})
