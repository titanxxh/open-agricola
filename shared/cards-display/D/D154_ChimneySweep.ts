import { Occupation } from '../types'

const CARD_ID = 'D154_ChimneySweep'

export const D154_ChimneySweep = new Occupation({
  id: CARD_ID,
  name: "Chimney Sweep",
  deck: "D",
  number: 154,
  category: "POINTS_PROVIDER",
  desc: [
    'Renovating to stone costs you 2 <STONE> less. During scoring, you get 1 bonus <SCORE> for each other player living in a stone house.',
  ],
  cost: {},
  players: "4+",
  extraVp: true,
})
