import { createAccumulatingAction } from '../../actions/factories/accumulate'

export const hollow4 = createAccumulatingAction({
  id: 'hollow-4',
  nameKey: 'actions.hollow-4.name',
  descriptionKey: 'actions.hollow-4.description',
  roundAvailable: 1,
  gainPerRound: { clay: 2 },
  players: [4],
})
