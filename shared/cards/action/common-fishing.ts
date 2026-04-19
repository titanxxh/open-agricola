import { createAccumulatingAction } from '../../actions/factories/accumulate'

export const fishing = createAccumulatingAction({
  id: 'fishing',
  nameKey: 'actions.fishing.name',
  descriptionKey: 'actions.fishing.description',
  roundAvailable: 1,
  gainPerRound: { food: 1 },
  players: [2, 3, 4],
})
