import { createGainAction } from '../../factories/gain'

export const resourceMarket4 = createGainAction({
  id: 'resource-market-4',
  nameKey: 'actions.resource-market-4.name',
  descriptionKey: 'actions.resource-market-4.description',
  roundAvailable: 1,
  gain: { reed: 1, stone: 1, food: 1 },
  players: [4],
})
