import { defineOccupationCard } from '../card-source'
import { canSow } from '../../actions/effects/sow'
import type { CardImpl } from '../registry'

const CARD_ID = 'D115_FodderPlanter'

const cardImpl = {
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

export const D115_FodderPlanter = defineOccupationCard({
  meta: {
    id: CARD_ID,
    name: "Fodder Planter",
    deck: "D",
    number: 115,
    category: "CROP_PROVIDER",
    desc: ["In the breeding phase of each harvest, for each newborn animal you get, you can sow crops in exactly 1 field."],
    cost: {},
    players: "1+",
  },
  impl: cardImpl,
})

export const D115_FodderPlanter_impl = D115_FodderPlanter.impl
