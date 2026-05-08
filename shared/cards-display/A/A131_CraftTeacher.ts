import { Occupation } from '../types'

const CARD_ID = 'A131_CraftTeacher'

export const A131_CraftTeacher = new Occupation({
  id: CARD_ID,
  name: 'Craft Teacher',
  deck: 'A',
  number: 131,
  category: 'ACTIONS_BOOSTER',
  desc: ["Each time after you build the major improvement __Joinery__, __Pottery__, and __Basketmaker's Workshop__, you can play up to 2 occupations without paying an occupation cost."],
  cost: {},
  players: '3+',
})
