import { majorCardEffects } from '../actions/cards/major'

export const majorImprovementIds = majorCardEffects.map(
  (improvement) => improvement.id,
)
