import { Occupation } from '../types'

const CARD_ID = 'A161_PatchCaretaker'

export const A161_PatchCaretaker = new Occupation({
  id: CARD_ID,
  name: 'Patch Caretaker',
  deck: 'A',
  number: 161,
  category: 'CROP_PROVIDER',
  desc: ['Each time you use an accumulation space while already having used another accumulation space for the same type of good that work phase, you also get 1 <VEGETABLE>.'],
  cost: {},
  players: '4+',
})
