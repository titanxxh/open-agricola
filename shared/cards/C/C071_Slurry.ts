import { defineMinorCard } from '../card-source'
import { canSow } from '../../actions/effects/sow'
import type { CardImpl } from '../registry'

const CARD_ID = 'C071_Slurry'

const cardImpl = {
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

export const C071_Slurry = defineMinorCard({
  meta: {
    id: CARD_ID,
    name: "Slurry",
    deck: "C",
    number: 71,
    category: "CROP_PROVIDER",
    desc: ["In the breeding phase of each harvest, if you get newborn animals of at least two types, you also get a __Sow__ action."],
    cost: {},
  },
  impl: cardImpl,
})

export const C071_Slurry_impl = C071_Slurry.impl
