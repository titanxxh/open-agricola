import { MinorImprovement } from '../types'
// NOTE: B81 Handcart requires a "take-from-space" effect that removes a resource from an
// action space before the work phase. This is not yet implemented (no take-from-space action).
// Card data only — effect not yet implemented.

export const B81_Handcart = new MinorImprovement({
  id: 'B81_Handcart',
  name: 'Handcart',
  deck: 'B',
  number: 81,
  category: 'BUILDING_RESOURCE_PROVIDER',
  desc: ['Before each work phase, you can take 1 building resource from at most one <WOOD>/<CLAY>/<REED>/<STONE> accumulation space containing at least 6/5/4/4 building resources of the same type.'],
  cost: { wood: 1 },
  evenMoreSet: true,
})
