import { Occupation } from '../types'

const CARD_ID = 'D148_DomesticianExpert'

export const D148_DomesticianExpert = new Occupation({
  id: CARD_ID,
  name: 'Domestician Expert',
  deck: 'D',
  number: 148,
  desc: ['You can keep 2 sheep on the border between each pair of orthogonally adjacent rooms.'],
  cost: {},
  players: '4+',
})
