import { Occupation } from '../types'
import { registerCardEffect } from '../card-effects'
import { canSow } from '../../actions/effects/sow'

const CARD_ID = 'D115_FodderPlanter'

registerCardEffect({
  id: CARD_ID,
  onEndHarvest: (state, player) => {
    if (!player.occupationPlayed.includes(CARD_ID)) return
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
})

export const D115_FodderPlanter = new Occupation({
  id: CARD_ID,
  name: "Fodder Planter",
  deck: "D",
  number: 115,
  category: "CROP_PROVIDER",
  desc: ["In the breeding phase of each harvest, for each newborn animal you get, you can sow crops in exactly 1 field."],
  cost: {},
  players: "1+",
})
