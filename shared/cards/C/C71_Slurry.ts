import { canSow } from '../../actions/effects/sow'
import type { CardImpl } from '../registry'
import { C71_Slurry } from '../../cards-display/C/C71_Slurry'

const CARD_ID = C71_Slurry.id

export const C71_Slurry_impl = {
  effect: {
  id: CARD_ID,
  onEndHarvest: (state, player) => {
    if (!canSow(player)) return
    const bredAnimalTypes = state.harvestBreedSummary?.[player.id]?.animalTypes ?? 0
    if (bredAnimalTypes < 2) return
    return {
      type: 'leaf',
      actionId: 'sow',
      optional: true,
      promptKey: 'ui.interactionSlurrySow',
      sourceCard: CARD_ID,
    }
  },
},
  reaches: [] as readonly string[],
} satisfies CardImpl
