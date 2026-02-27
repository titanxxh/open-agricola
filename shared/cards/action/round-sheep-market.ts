import { createAccumulatingAction } from '../../actions/factories/accumulate'

export const sheepMarket = createAccumulatingAction({
  id: 'sheep-market',
  nameKey: 'actions.sheep-market.name',
  descriptionKey: 'actions.sheep-market.description',
  roundAvailable: 1,
  gainPerRound: { sheep: 1 },
})
