import { createGainAction } from '../../actions/factories/gain'

export const vegetableSeeds = createGainAction({
  id: 'vegetable-seeds',
  nameKey: 'actions.vegetable-seeds.name',
  descriptionKey: 'actions.vegetable-seeds.description',
  roundAvailable: 3,
  gain: { vegetable: 1 },
})
