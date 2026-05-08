import { Occupation } from '../types'

const CARD_ID = 'B141_FieldCaretaker'

export const B141_FieldCaretaker = new Occupation({
  id: CARD_ID,
  name: 'Field Caretaker',
  deck: 'B',
  number: 141,
  category: 'CROP_PROVIDER',
  desc: ['When you play this card, you can immediately exchange 0/1/3 <CLAY> for 1/2/3 <GRAIN>. This card is a field.'],
  cost: {},
  players: '3+',
  isField: true,
})
