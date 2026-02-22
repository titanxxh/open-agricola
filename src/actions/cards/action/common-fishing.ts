import { createAccumulatingAction } from '../../factories/accumulate'

export const fishing = createAccumulatingAction({
  id: 'fishing',
  nameKey: 'actions.fishing.name',
  descriptionKey: 'actions.fishing.description',
  roundAvailable: 1,
  gainPerRound: { food: 1 },
})
