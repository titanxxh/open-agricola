import { MinorImprovement } from '../types'
import { canSow } from '../../actions/effects/sow'
import type { CardImpl } from '../registry'

const CARD_ID = 'C71_SlurrySpreader'

export const C71_SlurrySpreader = new MinorImprovement({
  id: CARD_ID,
  name: "Slurry Spreader",
  deck: "C",
  number: 71,
  category: "CROP_PROVIDER",
  desc: ["In the breeding phase of each harvest, if you get newborn animals of at least two types, you also get a __Sow__ action."],
  cost: {},
})

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
