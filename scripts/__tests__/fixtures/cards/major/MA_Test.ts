import { MajorImprovement } from '../../../../shared/cards/types'

export const MA_Test = new MajorImprovement({
  id: 'MA_Test',
  name: 'Major Test',
  deck: 'major',
  number: 1,
  desc: ['A test major improvement.'],
  cost: { wood: 2, clay: 1 },
})
