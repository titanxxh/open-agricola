import type { CardImpl } from '../registry'
import { A1_Shelter } from '../../cards-display/A/A1_Shelter'

const CARD_ID = A1_Shelter.id

export const A1_Shelter_impl = {
  effect: {
    id: CARD_ID,
    onBuy: () => ({
      type: 'leaf' as const,
      actionId: 'stables',
      sourceCard: CARD_ID,
      optional: true,
      actionContext: {
        max: 1,
        costOverride: { wood: -99 },
        zoneFilter: 'pasture-1',
      },
    }),
  },
  reaches: [] as readonly string[],
} satisfies CardImpl
