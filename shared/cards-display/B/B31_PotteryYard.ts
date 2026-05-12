import { MinorImprovement } from '../types'

const CARD_ID = 'B31_PotteryYard'

export const B31_PotteryYard = new MinorImprovement({
  id: CARD_ID,
  name: 'Pottery Yard',
  deck: 'B',
  number: 31,
  category: 'POINTS_PROVIDER',
  desc: [
    'During the scoring, if there are at least 2 orthogonally adjacent unused spaces in your farm, you get 2 bonus <SCORE>. (You still get the negative points for those unused spaces.',
  ],
  cost: {},
  vp: 1,
  prerequisite: 'Pottery (or an Upgrade Thereof)',
  extraVp: true,
})
