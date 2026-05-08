import { gainLeaf } from '../helpers/pay-gain-node'
import { registerPrerequisite } from '../helpers/prerequisite-registry'
import { fieldIsEmpty, fieldHasCrop } from '../../domain/field'
import type { CardImpl } from '../registry'
import { D8_FernSeeds } from '../../cards-display/D/D8_FernSeeds'

const CARD_ID = D8_FernSeeds.id

registerPrerequisite('1 Empty and 2 Planted Fields', (player) => {
  const empty = player.fields.filter(fieldIsEmpty).length
  const planted = player.fields.filter(
    (f) => fieldHasCrop(f, 'grain') || fieldHasCrop(f, 'vegetable'),
  ).length
  return empty >= 1 && planted >= 2
})

export const D8_FernSeeds_impl = {
  effect: {
  id: CARD_ID,
  onBuy: () => {
    return {
      type: 'seq',
      children: [
        gainLeaf(CARD_ID, { food: 2, grain: 1 }),
        {
          type: 'leaf',
          actionId: 'sow',
          sourceCard: CARD_ID,
          actionContext: { maxSelections: 1, cropType: 'grain' },
        },
      ],
    }
  },
},
  reaches: [] as readonly string[],
} satisfies CardImpl
