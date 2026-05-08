import { Occupation } from '../types'

const CARD_ID = 'E158_StoneCustodian'

export const E158_StoneCustodian = new Occupation({
  id: CARD_ID,
  name: 'Stone Custodian',
  deck: 'E',
  number: 158,
  category: 'FOOD',
  desc: ['At the end of each work phase, you get 1 <FOOD> for each stone accumulation space with stone on it.'],
  cost: {},
  players: '4+',
  evenMoreSet: true,
})
