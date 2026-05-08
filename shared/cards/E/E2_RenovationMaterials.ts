import { registerPrerequisite } from '../helpers/prerequisite-registry'
import type { CardImpl } from '../registry'
import { E2_RenovationMaterials } from '../../cards-display/E/E2_RenovationMaterials'

const CARD_ID = E2_RenovationMaterials.id

registerPrerequisite('Wooden House', (player) => player.houseType === 'wood')

export const E2_RenovationMaterials_impl = {
  effect: {
  id: CARD_ID,
  onBuy: () => ({
    type: 'leaf' as const,
    actionId: 'renovation',
    sourceCard: CARD_ID,
    params: { freeCost: true },
  }),
},
  reaches: [] as readonly string[],
} satisfies CardImpl
