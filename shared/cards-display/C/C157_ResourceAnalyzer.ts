import { Occupation } from '../types'

const CARD_ID = 'C157_ResourceAnalyzer'

export const C157_ResourceAnalyzer = new Occupation({
  id: CARD_ID,
  name: 'Resource Analyzer',
  deck: 'C',
  number: 157,
  category: 'FOOD_PROVIDER',
  desc: ['Before the start of each round, if you have more building resources than all other players of at least two types, you get 1 <FOOD>.'],
  cost: {},
  players: '4+',
  evenMoreSet: true,
})
