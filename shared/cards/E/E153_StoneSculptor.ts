import { Occupation } from '../types'

const CARD_ID = 'E153_StoneSculptor'

// TODO: The original card is a harvest-only exchange (max 1 per harvest), and also grants
// 1 bonus VP per use. Our exchange system does not support 'harvest' trigger or VP on exchanges,
// so this is simplified to an 'anytime' exchange with max 1 and no VP. The max:1 limits usage
// per exchange window, but does not strictly enforce the harvest-only restriction.

export const E153_StoneSculptor = new Occupation({
  id: CARD_ID,
  name: 'Stone Sculptor',
  deck: 'E',
  number: 153,
  category: 'BONUS_POINTS',
  desc: ['Each harvest, you can use this card to exchange exactly 1 <STONE> for 1 bonus <SCORE> and 1 <FOOD>.'],
  cost: {},
  players: '4+',
  exchanges: [
    // TODO: trigger should be 'harvest' but our system only supports 'anytime' | 'bake-bread'.
    // TODO: exchange should also grant 1 bonus SCORE VP, not currently supported.
    { from: { stone: 1 }, to: { food: 1 }, max: 1, triggers: ['anytime'] },
  ],
})
