import { canSow } from '../../actions/effects/sow'
import type { CardImpl } from '../registry'
import { D115_FodderPlanter } from '../../cards-display/D/D115_FodderPlanter'

const CARD_ID = D115_FodderPlanter.id

export const D115_FodderPlanter_impl = {
  effect: {
  id: CARD_ID,
  onEndHarvest: (state, player) => {
    if (!canSow(player)) return
    const newbornAnimals = state.harvestBreedSummary?.[player.id]?.animalCount ?? 0
    if (newbornAnimals <= 0) return
    return {
      type: 'leaf',
      actionId: 'sow',
      optional: true,
      promptKey: 'ui.interactionFodderPlanterSow',
      sourceCard: CARD_ID,
      actionContext: {
        maxSelections: newbornAnimals,
        excludedFields: [],
      },
    }
  },
},
  reaches: [] as readonly string[],
} satisfies CardImpl
