import { fieldHasCrop } from '../../domain/field'
import type { CardImpl } from '../registry'
import { C63_CraftBrewery } from '../../cards-display/C/C63_CraftBrewery'

const CARD_ID = C63_CraftBrewery.id

export const C63_CraftBrewery_impl = {
  effect: {
    id: CARD_ID,
    onHarvestFeedingPhase: (_state, player) => {
      if (player.resources.grain < 1) return
      const hasGrainField = player.fields.some((f) => fieldHasCrop(f, 'grain'))
      if (!hasGrainField) return
      return {
        type: 'seq',
        optional: true,
        children: [
          {
            type: 'leaf',
            actionId: 'special-effect',
            params: { kind: 'remove-field-crop', crop: 'grain', minRemaining: 1 },
            sourceCard: CARD_ID,
          },
          { type: 'leaf', actionId: 'pay-resources', params: { grain: 1 }, sourceCard: CARD_ID },
          { type: 'leaf', actionId: 'gain', params: { food: 4 }, sourceCard: CARD_ID },
          { type: 'leaf', actionId: 'bonus-vp', params: {}, sourceCard: CARD_ID },
          { type: 'leaf', actionId: 'bonus-vp', params: {}, sourceCard: CARD_ID },
        ],
      }
    },
  },
  reaches: [] as readonly string[],
} satisfies CardImpl
