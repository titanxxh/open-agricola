import { MinorImprovement } from '../types'

export const E71_CowPatty = new MinorImprovement({
  id: 'E71_CowPatty',
  name: 'Cow Patty',
  deck: 'E',
  number: 71,
  desc: ['Each time you sow in a field that is orthogonally adjacent to a pasture, you can place 1 additional good of the planted type in it.'],
  cost: {},
  vp: 1,
  prerequisite: '1 Cattle',
  implemented: true,
})
