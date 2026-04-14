import { MinorImprovement } from '../types'
import { registerCardEffect } from '../card-effects'
import { canSow } from '../../actions/effects/sow'

const CARD_ID = 'C71_Slurry'

registerCardEffect({
  id: CARD_ID,
  onEndHarvest: (state, player) => {
    if (!player.minorPlayed.includes(CARD_ID)) return
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
})

export const C71_Slurry = new MinorImprovement({
  id: CARD_ID,
  name: "Slurry",
  deck: "C",
  number: 71,
  category: "CROP_PROVIDER",
  desc: ["In the breeding phase of each harvest, if you get newborn animals of at least two types, you also get a __Sow__ action."],
  cost: {},
})
