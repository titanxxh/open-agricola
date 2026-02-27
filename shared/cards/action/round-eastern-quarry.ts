import { createAccumulatingAction } from '../../actions/factories/accumulate'

export const easternQuarry = createAccumulatingAction({
  id: 'eastern-quarry',
  nameKey: 'actions.eastern-quarry.name',
  descriptionKey: 'actions.eastern-quarry.description',
  roundAvailable: 4,
  gainPerRound: { stone: 1 },
})
