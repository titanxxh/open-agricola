import { defineMinorCard } from '../card-source'
import { makeCardFieldImpl } from '../helpers/card-field'
import { payLeaf, gainLeaf } from '../helpers/pay-gain-node'
import type { ActionFlow } from '../../contract/types'

const CARD_ID = 'C070_LettucePatch'
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

const cardImpl = makeCardFieldImpl(
  CARD_ID,
  { allowedCrops: ['vegetable'], capacity: 1 },
  {
    onReap: ({ amount }) => convertVegetablesFlow(amount),
  },
)

export const C070_LettucePatch = defineMinorCard({
  meta: {
    id: CARD_ID,
    name: 'Lettuce Patch',
    deck: 'C',
    number: 70,
    category: 'CROP_PROVIDER',
    providesField: true,
    vp: 1,
    cost: {},
    prerequisite: '3 Occupations',
    occupationPrerequisites: { min: 3 },
    isField: true,
    cardField: { allowedCrops: ['vegetable'], capacity: 1 },
    desc: [
        'This card is a <FIELD> that can only grow <VEGETABLE>. You can immediately turn each <VEGETABLE> you harvested from this card into 4 <FOOD>.',
      ],
  },
  impl: cardImpl,
})

export const C070_LettucePatch_impl = C070_LettucePatch.impl
