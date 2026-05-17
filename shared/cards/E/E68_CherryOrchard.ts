import { makeCardFieldImpl } from '../helpers/card-field'
import { gainLeaf } from '../helpers/pay-gain-node'
import { E68_CherryOrchard } from '../../cards-display/E/E68_CherryOrchard'

const CARD_ID = E68_CherryOrchard.id

export const E68_CherryOrchard_impl = makeCardFieldImpl(
  CARD_ID,
  { allowedCrops: ['wood'], capacity: 1 },
  {
    onReap: ({ isLast }) => {
      if (!isLast) return
      return gainLeaf(CARD_ID, { vegetable: 1 })
    },
  },
)
