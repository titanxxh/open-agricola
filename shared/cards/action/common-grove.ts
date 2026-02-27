import { createAccumulatingAction } from '../../actions/factories/accumulate'

export const grove = createAccumulatingAction({
  id: 'grove',
  nameKey: 'actions.grove.name',
  descriptionKey: 'actions.grove.description',
  roundAvailable: 1,
  gainPerRound: { wood: 2 },
  players: [3, 4],
})
