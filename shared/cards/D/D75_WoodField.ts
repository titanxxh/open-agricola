import { makeCardFieldImpl } from '../helpers/card-field'
import { D75_WoodField } from '../../cards-display/D/D75_WoodField'

export const D75_WoodField_impl = makeCardFieldImpl(D75_WoodField.id, {
  allowedCrops: ['wood'],
  capacity: 2,
})
