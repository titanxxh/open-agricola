import { createAccumulatingAction } from '../../factories/accumulate'

export const travelingPlayers = createAccumulatingAction({
  id: 'traveling-players',
  nameKey: 'actions.traveling-players.name',
  descriptionKey: 'actions.traveling-players.description',
  roundAvailable: 1,
  gainPerRound: { food: 1 },
  players: [4],
})
