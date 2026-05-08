import { Occupation } from '../types'

const CARD_ID = 'D145_RoofExaminer'

export const D145_RoofExaminer = new Occupation({
  id: CARD_ID,
  name: 'Roof Examiner',
  deck: 'D',
  number: 145,
  category: 'BUILDING_RESOURCE_PROVIDER',
  desc: ['When you play this card, if you have 1/2/3/4 major improvements, you immediately get 2/3/4/5 <REED>.'],
  cost: {},
  players: '3+',
  newSet: true,
})
