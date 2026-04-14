import { Occupation } from '../types'
// NOTE: C125 Nightworker requires placing a farmer on an accumulation space BEFORE the work
// phase starts (i.e., before other players act). This requires a "pre-work" phase place-farmer
// which is not currently supported in our hook system. Marked banned in BGA too.
// Card data only — effect not yet implemented.

export const C125_Nightworker = new Occupation({
  id: 'C125_Nightworker',
  name: 'Nightworker',
  deck: 'C',
  number: 125,
  category: 'BUILDING_RESOURCE_PROVIDER',
  desc: ['Before the start of each work phase, you can place a person on an accumulation space of a building resource not in your supply. (Then proceed with the start player.)'],
  cost: {},
  players: '1+',
  evenMoreSet: true,
})
