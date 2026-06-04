import { defineMinorCard } from '../card-source'
import type { CardImpl } from '../registry'
import { fieldIsEmpty } from '../../domain/field'
import { hasAnyCardFieldCrops } from '../helpers/card-field'

const CARD_ID = 'C72_FestivalPlanning'

const cardImpl = {
  effect: {
  id: CARD_ID,
  onBuy: (_state, player) => {
    const hasCrops = player.fields.some((f) => !fieldIsEmpty(f)) || hasAnyCardFieldCrops(player)
    return {
      type: 'seq' as const,
      children: [
        ...(hasCrops
          ? [{
              type: 'leaf' as const,
              actionId: 'private-field-phase',
              sourceCard: CARD_ID,
            }]
          : []),
        {
          type: 'leaf' as const,
          actionId: 'improvement',
          optional: true,
          sourceCard: CARD_ID,
        },
      ],
    }
  },
},
  reaches: [] as readonly string[],
} satisfies CardImpl

export const C72_FestivalPlanning = defineMinorCard({
  meta: {
    id: CARD_ID,
    name: "Festival Planning",
    deck: "C",
    number: 72,
    category: "CROP_PROVIDER",
    desc: ["When you play this card, immediately carry out the field phase on your farmyard only (this is not a harvest). Afterwards, you get a __Major or Minor Improvement__ action."],
    cost: { food: 1 },
    prerequisite: "2 Occupations",
    occupationPrerequisites: { min: 2 },
  },
  impl: cardImpl,
})

export const C72_FestivalPlanning_impl = C72_FestivalPlanning.impl
