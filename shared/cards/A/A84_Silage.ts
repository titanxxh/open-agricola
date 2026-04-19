import { MinorImprovement } from '../types'
import { registerCardEffect } from '../card-effects'
import type { ActionFlow } from '../../game/types'
import { fieldHasCrop } from '../../game/field'

const CARD_ID = 'A84_Silage'
const harvestRounds = [4, 7, 9, 11, 13, 14]

const BREEDABLE_TYPES = ['cattle', 'boar', 'sheep'] as const

registerCardEffect({
  id: CARD_ID,
  onReturnHome: (state, player) => {
    if (harvestRounds.includes(state.round)) return
    if (player.fields.length < 2) return

    // Check grain availability (reserve or field)
    const hasGrain = player.resources.grain >= 1 ||
      player.fields.some((f) => fieldHasCrop(f, 'grain'))
    if (!hasGrain) return

    const breedableTypes = BREEDABLE_TYPES.filter(
      (t) => player.resources[t] >= 2,
    )
    if (breedableTypes.length === 0) return

    const children: ActionFlow[] = breedableTypes.map((animalType) => ({
      type: 'seq' as const,
      children: [
        { type: 'leaf' as const, actionId: 'pay-grain-any', sourceCard: CARD_ID },
        { type: 'leaf' as const, actionId: 'gain', params: { [animalType]: 1 }, sourceCard: CARD_ID },
      ],
      choiceLabelKey: `ui.interactionSilageBreed`,
      choiceLabelParams: { animal: animalType },
    }))

    children.push({
      type: 'leaf',
      actionId: 'noop',
      choiceLabelKey: 'ui.interactionDecline',
    })

    return {
      type: 'xor',
      promptKey: 'ui.interactionSilage',
      children,
    }
  },
})

export const A84_Silage = new MinorImprovement({
  id: CARD_ID,
  name: "Silage",
  deck: "A",
  number: 84,
  category: "LIVESTOCK_PROVIDER",
  desc: ["In each returning home phase after which there is no harvest, you can pay exactly 1 <GRAIN> - even from a field - to breed exactly one type of animal."],
  cost: {},
  prerequisite: "2 Fields",
})
