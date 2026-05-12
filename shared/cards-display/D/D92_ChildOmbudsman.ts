import { Occupation } from '../types'

const CARD_ID = 'D92_ChildOmbudsman'

export const D92_ChildOmbudsman = new Occupation({
  id: CARD_ID,
  name: 'Child Ombudsman',
  deck: 'D',
  number: 92,
  category: 'ACTIONS_BOOSTER',
  desc: ['From round 5 on, if you have room in your house, at the end of each person action, you can take a __Family Growth__ action with that person. If you do, you get 2 negative <SCORE>.'],
  cost: {},
  players: '1+',
  extraVp: true,
})
