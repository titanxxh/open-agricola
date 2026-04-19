import { createAccumulatingAction } from '../../actions/factories/accumulate'

export const hollow = createAccumulatingAction({
  id: 'hollow',
  nameKey: 'actions.hollow.name',
  descriptionKey: 'actions.hollow.description',
  roundAvailable: 1,
  gainPerRound: { clay: 1 },
  players: [3],
})
