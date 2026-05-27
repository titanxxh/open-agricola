import { makeCardFieldImpl } from '../helpers/card-field'
import { payLeaf, gainLeaf } from '../helpers/pay-gain-node'
import type { ActionFlow } from '../../contract/types'
import { C70_LettucePatch } from '../../cards-display/C/C70_LettucePatch'

const CARD_ID = C70_LettucePatch.id

const convertVegetablesFlow = (amount: number): ActionFlow | undefined => {
  if (amount <= 0) return
  const children = Array.from({ length: amount }, (_, index) => {
    const count = index + 1
    return {
      type: 'seq' as const,
      children: [
        payLeaf({ cardId: CARD_ID, cost: { vegetable: count } }),
        gainLeaf(CARD_ID, { food: 4 * count }),
      ],
    }
  })
  return {
    type: 'xor',
    optional: true,
    children,
  }
}

export const C70_LettucePatch_impl = makeCardFieldImpl(
  CARD_ID,
  { allowedCrops: ['vegetable'], capacity: 1 },
  {
    onReap: ({ amount }) => convertVegetablesFlow(amount),
  },
)
