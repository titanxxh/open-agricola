import { MinorImprovement } from '../types'

const CARD_ID = 'D31_Storeroom'

export const D31_Storeroom = new MinorImprovement({
  id: CARD_ID,
  name: "Storeroom",
  deck: "D",
  number: 31,
  category: "POINTS_PROVIDER",
  desc: [
    'During scoring, you get ½ bonus <SCORE> for each pair of <GRAIN> plus <VEGETABLE> you have (considering all crops in your supply and fields), rounded up.',
  ],
  cost: { wood: 1, stone: 2 },
  vp: 1,
  extraVp: true,
})
