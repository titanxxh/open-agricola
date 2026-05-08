import { MinorImprovement } from '../types'

const CARD_ID = 'E26_Sundial'

export const E26_Sundial = new MinorImprovement({
  id: CARD_ID,
  name: 'Sundial',
  deck: 'E',
  number: 26,
  category: 'ACTION',
  desc: ['At the end of the work phases of rounds 7 and 9, you can take a __Sow__ action without placing a person.'],
  cost: { wood: 1 },
})
