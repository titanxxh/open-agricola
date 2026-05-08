import { Occupation } from '../types'

const CARD_ID = 'C145_ForestReviewer'

export const C145_ForestReviewer = new Occupation({
  id: CARD_ID,
  name: 'Forest Reviewer',
  deck: 'C',
  number: 145,
  category: 'ACTIONS_BOOSTER',
  desc: [
    'Each time after any player (including you) uses the unoccupied __Grove__ or __Forest__ accumulation space while the other of the two is occupied, you get 1 <REED>.',
  ],
  cost: {},
  players: '3+',
})
