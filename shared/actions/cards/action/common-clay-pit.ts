import { createAccumulatingAction } from '../../factories/accumulate'

export const clayPit = createAccumulatingAction({
  id: 'clay-pit',
  nameKey: 'actions.clay-pit.name',
  descriptionKey: 'actions.clay-pit.description',
  roundAvailable: 1,
  gainPerRound: { clay: 1 },
})
