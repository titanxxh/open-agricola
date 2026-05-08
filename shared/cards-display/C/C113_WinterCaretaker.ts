import { Occupation } from '../types'

const CARD_ID = 'C113_WinterCaretaker'

export const C113_WinterCaretaker = new Occupation({
  id: CARD_ID,
  name: 'Winter Caretaker',
  deck: 'C',
  number: 113,
  category: 'CROP_PROVIDER',
  desc: [
    'When you play this card, you immediately get 1 <GRAIN>. At the end of each harvest, you can buy exactly 1 <VEGETABLE> for 2 <FOOD>.',
  ],
  cost: {},
  players: '1+',
})
