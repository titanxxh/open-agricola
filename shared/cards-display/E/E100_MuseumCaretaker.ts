import { Occupation } from '../types'

const CARD_ID = 'E100_MuseumCaretaker'

export const E100_MuseumCaretaker = new Occupation({
  id: CARD_ID,
  name: 'Museum Caretaker',
  deck: 'E',
  number: 100,
  category: 'BONUS_POINTS_-_GET',
  desc: ['At the start of each work phase, if you have at least 1 <WOOD>, 1 <CLAY>, 1\u00a0<REED>, 1 <STONE>, 1 <GRAIN>, and 1 <VEGETABLE> in your supply, you get 1\u00a0bonus <SCORE>.'],
  cost: {},
  players: '1+',
})
