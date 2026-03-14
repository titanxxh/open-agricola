import { MinorImprovement } from '../types'
import { registerCardEffect } from '../card-effects'
import { incCounter } from '../__stubs__/helpers'

const CARD_ID = 'A84_Silage'
const harvestRounds = [4, 7, 9, 11, 13, 14]

// Ordered by breeding value (most valuable first)
const BREEDABLE_TYPES = ['cattle', 'boar', 'sheep'] as const

registerCardEffect({
  id: CARD_ID,
  onReturnHome: (state, player) => {
    if (!player.minorPlayed.includes(CARD_ID)) return
    if (harvestRounds.includes(state.round)) return

    // Prerequisite: must have at least 2 fields
    if (player.fields.length < 2) return

    const breedableTypes = BREEDABLE_TYPES.filter(
      (t) => player.resources[t] >= 2,
    )
    if (breedableTypes.length === 0) return

    // Try paying 1 grain: first from reserve, then from a field
    let paid = false
    if (player.resources.grain >= 1) {
      player.resources.grain -= 1
      paid = true
    } else {
      // Try paying from a grain field
      const grainField = player.fields.find(
        (f) => f.crop === 'grain' && f.remaining > 0,
      )
      if (grainField) {
        grainField.remaining -= 1
        if (grainField.remaining === 0) {
          grainField.crop = null
        }
        paid = true
      }
    }
    if (!paid) return

    // Breed the most valuable eligible animal type
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
  desc: ["In the returning home phase of each round that does not end with a harvest, you can pay 1 <GRAIN> (from reserve or field) to breed one type of animal."],
  cost: {},
  prerequisite: "2 Fields",
})
