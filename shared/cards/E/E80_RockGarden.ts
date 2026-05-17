import { makeCardFieldImpl } from '../helpers/card-field'
import { E80_RockGarden } from '../../cards-display/E/E80_RockGarden'

export const E80_RockGarden_impl = makeCardFieldImpl(E80_RockGarden.id, {
  allowedCrops: ['stone'],
  capacity: 3,
})
