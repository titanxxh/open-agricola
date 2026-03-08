import { MinorImprovement } from '../types'
import { registerCardEffect } from '../card-effects'
import { incCounter } from '../__stubs__/helpers'

const CARD_ID = 'A84_Silage'
const harvestRounds = [4, 7, 9, 11, 13, 14]

registerCardEffect({
  id: CARD_ID,
  onReturnHome: (state, player) => {
    if (!player.minorPlayed.includes(CARD_ID)) return
    if (harvestRounds.includes(state.round)) return
    if (player.resources.grain <= 0) return
    const breedableTypes = (['sheep', 'boar', 'cattle'] as const).filter(
      (t) => player.resources[t] >= 2,
    )
    if (breedableTypes.length === 0) return
    player.resources.grain -= 1
    const animalType = breedableTypes[0]
    player.resources[animalType] += 1
    incCounter(player, CARD_ID, 'triggerCount')
  },
})

export const A84_Silage = new MinorImprovement({
  id: CARD_ID,
  name: "Silage",
  deck: "A",
  number: 84,
  category: "LIVESTOCK_PROVIDER",
  desc: ["In the returning home phase of each round that does not end with a harvest, you can pay 1 <GRAIN> to breed one type of animal."],
  cost: {},
})
