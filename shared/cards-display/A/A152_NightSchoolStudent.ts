import { Occupation } from '../types'

const CARD_ID = 'A152_NightSchoolStudent'

export const A152_NightSchoolStudent = new Occupation({
  id: CARD_ID,
  name: 'Night-School Student',
  deck: 'A',
  number: 152,
  category: 'ACTIONS_BOOSTER',
  desc: ['Each returning home phase in which no player returns a person from a __Lessons__ action space, you can play an occupation for an occupation cost of 1 <FOOD>.'],
  cost: {},
  players: '4+',
})
