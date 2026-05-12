import { Occupation } from '../types'

const CARD_ID = 'A96_TaskArtisan'

export const A96_TaskArtisan = new Occupation({
  id: CARD_ID,
  name: 'Task Artisan',
  deck: 'A',
  number: 96,
  category: 'ACTIONS_BOOSTER',
  desc: [
    'When you play this card and each time a stone accumulation space appears on a round space in the preparation phase, you get 1 <WOOD> and a __Minor Improvement__ action.',
  ],
  cost: {},
  players: '1+',
})
