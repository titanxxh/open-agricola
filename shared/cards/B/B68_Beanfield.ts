import { makeCardFieldImpl } from '../helpers/card-field'
import { B68_Beanfield } from '../../cards-display/B/B68_Beanfield'

export const B68_Beanfield_impl = makeCardFieldImpl(B68_Beanfield.id, {
  allowedCrops: ['vegetable'],
  capacity: 1,
})
