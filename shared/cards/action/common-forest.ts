import { createAccumulatingAction } from '../../actions/factories/accumulate'

export const forest = createAccumulatingAction({
  id: 'forest',
  nameKey: 'actions.forest.name',
  descriptionKey: 'actions.forest.description',
  roundAvailable: 1,
  gainPerRound: { wood: 3 },
  players: [1, 2, 3, 4, 5, 6],
})
