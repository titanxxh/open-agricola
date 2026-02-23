import { createAccumulatingAction } from '../../factories/accumulate'

export const copse = createAccumulatingAction({
  id: 'copse',
  nameKey: 'actions.copse.name',
  descriptionKey: 'actions.copse.description',
  roundAvailable: 1,
  gainPerRound: { wood: 1 },
  players: [4],
})
