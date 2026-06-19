import { createGainAction } from '../../actions/factories/gain'

export const dayLaborer = createGainAction({
  id: 'day-laborer',
  nameKey: 'actions.day-laborer.name',
  descriptionKey: 'actions.day-laborer.description',
  roundAvailable: 1,
  gain: { food: 2 },
  players: [2, 3, 4, 5, 6],
})
