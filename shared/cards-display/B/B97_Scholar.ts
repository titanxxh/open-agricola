import { Occupation } from '../types'

const CARD_ID = 'B97_Scholar'

export const B97_Scholar = new Occupation({
  id: CARD_ID,
  name: 'Scholar',
  deck: 'B',
  number: 97,
  category: 'ACTIONS_BOOSTER',
  desc: ['Once you live in a stone house, at the start of each round, you can play an occupation for an occupation cost of 1 <FOOD>, or a minor improvement (by paying its cost).'],
  cost: {},
  players: '1+',
})
