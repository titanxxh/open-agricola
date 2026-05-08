import { Occupation } from '../types'

const CARD_ID = 'E131_MarketMaster'

export const E131_MarketMaster = new Occupation({
  id: CARD_ID,
  name: 'Market Master',
  deck: 'E',
  number: 131,
  category: 'ACTION_-_IMPROVEMENTS_OR_OCCUPATIONS',
  desc: ['Immediately after each time you place your last person in a round on the __Traveling Players__ accumulation space, you can play 1 occupation for an occupation cost of 1 <FOOD>.'],
  cost: {},
  players: '4+',
})
