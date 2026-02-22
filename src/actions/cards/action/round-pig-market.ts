import { createAccumulatingAction } from '../../factories/accumulate'

export const pigMarket = createAccumulatingAction({
  id: 'pig-market',
  nameKey: 'actions.pig-market.name',
  descriptionKey: 'actions.pig-market.description',
  roundAvailable: 1,
  gainPerRound: { boar: 1 },
})
