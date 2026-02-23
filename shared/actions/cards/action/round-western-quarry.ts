import { createAccumulatingAction } from '../../factories/accumulate'

export const westernQuarry = createAccumulatingAction({
  id: 'western-quarry',
  nameKey: 'actions.western-quarry.name',
  descriptionKey: 'actions.western-quarry.description',
  roundAvailable: 2,
  gainPerRound: { stone: 1 },
})
