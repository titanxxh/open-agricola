import { Occupation } from '../types'
// NOTE: A151_Minstrel logic (use a stage-1 action space without placing a worker during
// the return-home phase) requires a "use-action-space" leaf that doesn't currently exist.
// Card data only — effect not yet implemented.

const CARD_ID = 'A151_Minstrel'

export const A151_Minstrel = new Occupation({
  id: CARD_ID,
  name: 'Minstrel',
  deck: 'A',
  number: 151,
  category: 'ACTIONS_BOOSTER',
  desc: ['At the start of each returning home phase, if only one action space card on round space 1 to 4 is unoccupied, you can use that action space.'],
  cost: {},
  players: '4+',
  newSet: true,
})
