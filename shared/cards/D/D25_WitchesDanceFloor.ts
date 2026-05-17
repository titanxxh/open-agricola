import { makeCardFieldImpl } from '../helpers/card-field'
import { D25_WitchesDanceFloor } from '../../cards-display/D/D25_WitchesDanceFloor'

export const D25_WitchesDanceFloor_impl = makeCardFieldImpl(
  D25_WitchesDanceFloor.id,
  { allowedCrops: ['grain', 'vegetable'], capacity: 1 },
)
