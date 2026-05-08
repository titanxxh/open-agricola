import { MinorImprovement } from '../types'

const CARD_ID = 'E44_FodderBeets'

export const E44_FodderBeets = new MinorImprovement({
  id: CARD_ID,
  name: 'Fodder Beets',
  deck: 'E',
  number: 44,
  category: 'FOOD_-_FUTURE_ROUND_SPACES',
  desc: ['Place 1 <FOOD> on each remaining odd-numbered round space. At the start of these rounds, you get the <FOOD>.'],
  vp: 1,
  prerequisite: '3 Field Tiles',
})
