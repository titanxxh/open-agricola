import { Occupation } from '../types'

const CARD_ID = 'E152_BargainHunter'

export const E152_BargainHunter = new Occupation({
  id: CARD_ID,
  name: 'Bargain Hunter',
  deck: 'E',
  number: 152,
  category: 'ACTION_-_IMPROVEMENTS_OR_OCCUPATIONS',
  desc: ['At the start of each round, you can place 1 <FOOD> from your supply on the __Traveling Players__ accumulation space to play a minor improvement by paying its cost.'],
  cost: {},
  players: '4+',
})
