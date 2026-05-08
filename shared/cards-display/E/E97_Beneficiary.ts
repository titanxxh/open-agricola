import { Occupation } from '../types'

const CARD_ID = 'E97_Beneficiary'

export const E97_Beneficiary = new Occupation({
  id: CARD_ID,
  name: 'Beneficiary',
  deck: 'E',
  number: 97,
  category: 'ACTION_-_OCCUPATION',
  desc: ['If this is your 3rd occupation, you can immediately play another occupation for an occupation cost of 1 <FOOD> and/or play 1 minor improvement by paying its cost.'],
  players: '1+',
})
