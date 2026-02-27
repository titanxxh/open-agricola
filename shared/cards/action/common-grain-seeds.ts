import { createGainAction } from '../../actions/factories/gain'

export const grainSeeds = createGainAction({
  id: 'grain-seeds',
  nameKey: 'actions.grain-seeds.name',
  descriptionKey: 'actions.grain-seeds.description',
  roundAvailable: 1,
  gain: { grain: 1 },
})
