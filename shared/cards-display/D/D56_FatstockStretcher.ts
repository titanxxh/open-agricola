import { MinorImprovement } from '../types'

const CARD_ID = 'D56_FatstockStretcher'

export const D56_FatstockStretcher = new MinorImprovement({
  id: CARD_ID,
  name: 'Fatstock Stretcher',
  deck: 'D',
  number: 56,
  category: 'FOOD_PROVIDER',
  desc: ['Each time you turn a <SHEEP> or <PIG> into <FOOD> using a cooking improvement, you get 1 additional <FOOD>.'],
  cost: { wood: 1 },
})
