import type { CardImpl } from '../registry'
import { C72_FestivalPlanning } from '../../cards-display/C/C72_FestivalPlanning'
import { fieldIsEmpty } from '../../domain/field'
import { hasAnyCardFieldCrops } from '../helpers/card-field'

const CARD_ID = C72_FestivalPlanning.id

export const C72_FestivalPlanning_impl = {
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
