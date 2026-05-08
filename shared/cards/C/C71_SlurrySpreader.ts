import { canSow } from '../../actions/effects/sow'
import type { CardImpl } from '../registry'
import { C71_SlurrySpreader } from '../../cards-display/C/C71_SlurrySpreader'

const CARD_ID = C71_SlurrySpreader.id

export const C71_SlurrySpreader_impl = {
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
      promptKey: 'ui.interactionSlurrySpreaderSow',
      sourceCard: CARD_ID,
    }
  },
},
  reaches: [] as readonly string[],
} satisfies CardImpl
