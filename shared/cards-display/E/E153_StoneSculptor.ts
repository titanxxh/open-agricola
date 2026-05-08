import { Occupation } from '../types'

const CARD_ID = 'E153_StoneSculptor'

export const E153_StoneSculptor = new Occupation({
  id: CARD_ID,
  name: 'Stone Sculptor',
  deck: 'E',
  number: 153,
  category: 'BONUS_POINTS',
  desc: ['Each harvest, you can use this card to exchange exactly 1 <STONE> for 1 bonus <SCORE> and 1 <FOOD>.'],
  cost: {},
  players: '4+',
  extraVp: true,
  exchanges: [
    {
      from: { stone: 1 },
      to: { food: 1 },
      max: 1,
      triggers: ['harvest'],
      sourceId: CARD_ID,
      sideEffect: { type: 'bonusVp', amount: 1 },
    },
  ],
})
