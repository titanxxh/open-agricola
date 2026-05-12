import { MinorImprovement } from '../types'

const CARD_ID = 'D30_ArtisanDistrict'

export const D30_ArtisanDistrict = new MinorImprovement({
  id: CARD_ID,
  name: "Artisan District",
  deck: "D",
  number: 30,
  category: "POINTS_PROVIDER",
  desc: ['During scoring, you get 2/5/8 bonus <SCORE> for having 3/4/5 major improvements from the bottom row of the supply board.'],
  cost: { stone: 1 },
  vp: 1,
  prerequisite: '3 Occupations',
  extraVp: true,
})
