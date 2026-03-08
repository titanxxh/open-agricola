import { MinorImprovement } from '../types'
import { registerCardEffect } from '../card-effects'
import { incCounter } from '../__stubs__/helpers'

const CARD_ID = 'A64_BarleyMill'

registerCardEffect({
  id: CARD_ID,
  onAfterReap: (_state, player) => {
    if (!player.minorPlayed.includes(CARD_ID)) return
    const grainFields = player.fields.filter(f => f.crop === 'grain' && f.amount > 0).length
    if (grainFields <= 0) return
    incCounter(player, CARD_ID, 'triggerCount')
    player.resources.food += grainFields
  },
})

export const A64_BarleyMill = new MinorImprovement({
  id: CARD_ID,
  name: "Barley Mill",
  deck: "A",
  number: 64,
  category: "FOOD_PROVIDER",
  desc: ["In the field phase of each harvest, you get 1 <FOOD> for each grain field that you harvest."],
  cost: {},
})
