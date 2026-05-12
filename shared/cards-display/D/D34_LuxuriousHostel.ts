import { MinorImprovement } from '../types'

const CARD_ID = 'D34_LuxuriousHostel'

export const D34_LuxuriousHostel = new MinorImprovement({
  id: CARD_ID,
  name: "Luxurious Hostel",
  deck: "D",
  number: 34,
  category: "POINTS_PROVIDER",
  desc: [
    'During scoring, if you then have more stone rooms than people, you get 4 bonus <SCORE>. You can only use one card to get bonus points for your stone house.',
  ],
  cost: { wood: 1, clay: 2 },
  extraVp: true,
})
