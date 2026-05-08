import { MinorImprovement } from '../types'

const CARD_ID = 'D29_MuckRake'

export const D29_MuckRake = new MinorImprovement({
  id: CARD_ID,
  name: "Muck Rake",
  deck: "D",
  number: 29,
  category: "POINTS_PROVIDER",
  desc: [
    'During scoring, you get 1 bonus <SCORE> for exactly 1 unfenced stable holding exactly 1 <SHEEP>. The same applies to <PIG> and <CATTLE>, if held in different unfenced stables.',
  ],
  cost: { wood: 1 },
})
