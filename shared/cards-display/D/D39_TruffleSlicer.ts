import { MinorImprovement } from '../types'

const CARD_ID = 'D39_TruffleSlicer'

export const D39_TruffleSlicer = new MinorImprovement({
  id: CARD_ID,
  name: 'Truffle Slicer',
  deck: 'D',
  number: 39,
  category: 'POINTS_PROVIDER',
  desc: ['Each time you use a wood accumulation space, if you have at least 1 <PIG>, you can pay 1 <FOOD> for 1 bonus <SCORE>.'],
  cost: { wood: 1 },
  prerequisite: 'Play in Round 8 or Later',
})
