import { Occupation } from '../types'

const CARD_ID = 'C97_SeedResearcher'

export const C97_SeedResearcher = new Occupation({
  id: CARD_ID,
  name: 'Seed Researcher',
  deck: 'C',
  number: 97,
  category: 'ACTIONS_BOOSTER',
  desc: ['Each time any people return from both the __Grain Seeds__ and __Vegetable Seeds__ action spaces, you get 2 <FOOD> and you can play 1 occupation, without paying an occupation cost.'],
  cost: {},
  players: '1+',
  evenMoreSet: true,
})
