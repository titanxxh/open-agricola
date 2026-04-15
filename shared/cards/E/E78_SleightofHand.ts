import { MinorImprovement } from '../types'
// BGA: onBuy uses SPECIAL_EFFECT argsTradeResources — player exchanges up to 4 building
// resources for an equal number of different building resources. Complex trade UI not available.
// TODO: implement arbitrary building-resource swap (up to 4 total).

export const E78_SleightofHand = new MinorImprovement({
  id: 'E78_SleightofHand',
  name: 'Sleight of Hand',
  deck: 'E',
  number: 78,
  category: 'RESOURCE_WOOD',
  desc: ['When you play this card, you can immediately exchange up to 4 building resources for an equal number of other building resources.'],
  prerequisite: '3 Occupations',
  occupationPrerequisites: { min: 3 },
})
