import { createAccumulatingAction } from '../../factories/accumulate'

export const cattleMarket = createAccumulatingAction({
  id: 'cattle-market',
  nameKey: 'actions.cattle-market.name',
  descriptionKey: 'actions.cattle-market.description',
  roundAvailable: 1,
  gainPerRound: { cattle: 1 },
})
