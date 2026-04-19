import { MinorImprovement } from '../types'
import { registerCardEffect } from '../card-effects'
import { fieldTopStack, fieldDecrementTop } from '../../game/field'

const CARD_ID = 'C63_CraftBrewery'

registerCardEffect({
  id: CARD_ID,
  onHarvestFeedingPhase: (_state, player) => {
    if (player.resources.grain < 1) return
    const grainField = player.fields.find((f) => fieldTopStack(f)?.kind === 'grain')
    if (!grainField) return
    // Deduct field grain imperatively (undo system handles rollback) — top must be grain
    fieldDecrementTop(grainField)
    return {
      type: 'seq',
      optional: true,
      children: [
        { type: 'leaf', actionId: 'pay-resources', params: { grain: 1 }, sourceCard: CARD_ID },
        { type: 'leaf', actionId: 'gain', params: { food: 4 }, sourceCard: CARD_ID },
        { type: 'leaf', actionId: 'bonus-vp', params: {}, sourceCard: CARD_ID },
        { type: 'leaf', actionId: 'bonus-vp', params: {}, sourceCard: CARD_ID },
      ],
    }
  },
})

export const C63_CraftBrewery = new MinorImprovement({
  id: "C63_CraftBrewery",
  name: "Craft Brewery",
  deck: "C",
  number: 63,
  category: "FOOD_PROVIDER",
  desc: ["In the feeding phase of each harvest, you can use this card to exchange 1 <GRAIN> from your supply plus 1 <GRAIN> from a field for 2 bonus <SCORE> and 4 <FOOD>."],
  cost: {"wood":2,"clay":1},
})
