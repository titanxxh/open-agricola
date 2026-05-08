import { fieldHasCrop } from '../../domain/field'
import type { CardImpl } from '../registry'
import { D153_WealthyMan } from '../../cards-display/D/D153_WealthyMan'
export { D153_WealthyMan }

const CARD_ID = D153_WealthyMan.id

const harvestGrainFieldThreshold: Record<number, number> = {
  4: 1,
  7: 2,
  9: 3,
  11: 4,
  13: 5,
  14: 6,
}

export const D153_WealthyMan_impl = {
  effect: {
  id: CARD_ID,
  onStartHarvest: (state, player) => {

    const threshold = harvestGrainFieldThreshold[state.round]
    if (threshold === undefined) return

    const grainFieldCount = player.fields.filter(
      (f) => fieldHasCrop(f, 'grain'),
    ).length
    if (grainFieldCount < threshold) return

    return {
      type: 'leaf',
      actionId: 'bonus-vp',
      sourceCard: CARD_ID,
    }
  },
},
  reaches: [] as readonly string[],
} satisfies CardImpl
