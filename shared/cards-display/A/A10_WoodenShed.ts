import { MinorImprovement } from '../types'

const CARD_ID = 'A10_WoodenShed'

export const A10_WoodenShed = new MinorImprovement({
  id: CARD_ID,
  name: 'Wooden Shed',
  deck: 'A',
  number: 10,
  category: 'FARM_PLANNER',
  desc: ['This card can only be played via a __Major Improvement__ action. It provides room for one person. You may no longer renovate.'],
  cost: { wood: 2, reed: 1 },
  prerequisite: 'Still in Wooden House',
  mustBePlayedViaMajorImprovementAction: true,
  evenMoreSet: true,
})
