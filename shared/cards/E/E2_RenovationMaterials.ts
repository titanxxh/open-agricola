import type { CardImpl } from '../registry'
import { E2_RenovationMaterials } from '../../cards-display/E/E2_RenovationMaterials'

const CARD_ID = E2_RenovationMaterials.id

export const E2_RenovationMaterials_impl = {
  prerequisiteCheck: (player) => player.houseType === 'wood',
  effect: {
    id: CARD_ID,
    onBuy: () => ({
      type: 'leaf' as const,
      actionId: 'renovate-house',
      sourceCard: CARD_ID,
      params: { selectedOption: 'clay' },
      actionContext: { exactCost: {} },
    }),
  },
  reaches: [] as readonly string[],
} satisfies CardImpl
