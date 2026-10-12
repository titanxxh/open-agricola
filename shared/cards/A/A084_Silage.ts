import { defineMinorCard } from '../card-source'
import type { ActionFlow } from '../../contract/types'
import { createCropPaymentAction } from '../../actions/plans/crop-payment'
import { registerAdHocAction } from '../../actions/helpers/ad-hoc-action-registry'
import type { CardImpl } from '../registry'
import { getLogicalFields } from '../helpers/card-field'

const CARD_ID = 'A084_Silage'
const PAY_GRAIN_ACTION_ID = 'card_A084_Silage_pay-grain-any'

const harvestRounds = [4, 7, 9, 11, 13, 14]

const BREEDABLE_TYPES = ['cattle', 'boar', 'sheep'] as const

registerAdHocAction(createCropPaymentAction(CARD_ID, PAY_GRAIN_ACTION_ID, 'grain', 1))

const cardImpl = {
  effect: {
  id: CARD_ID,
  onReturnHome: (state, player) => {
    if (harvestRounds.includes(state.round)) return
    const fields = getLogicalFields(player)
    if (fields.length < 2) return

    // Check grain availability (reserve or field)
    const hasGrain = player.resources.grain >= 1 || fields.some(
      (field) => [...field.slots].reverse().find((slot) => slot.stack)?.stack?.kind === 'grain',
    )
    if (!hasGrain) return

    const breedableTypes = BREEDABLE_TYPES.filter(
      (t) => player.resources[t] >= 2,
    )
    if (breedableTypes.length === 0) return

    const children: ActionFlow[] = breedableTypes.map((animalType) => ({
      type: 'seq' as const,
      children: [
        { type: 'leaf' as const, actionId: PAY_GRAIN_ACTION_ID, sourceCard: CARD_ID },
        { type: 'leaf' as const, actionId: 'gain', params: { [animalType]: 1 }, sourceCard: CARD_ID },
      ],
    }))

    return {
      type: 'xor',
      optional: true,
      promptKey: 'ui.interactionSilage',
      children,
    }
  },
},
  reaches: [] as readonly string[],
} satisfies CardImpl

export const A084_Silage = defineMinorCard({
  presentation: { stack: true },
  meta: {
    id: CARD_ID,
    name: "Silage",
    deck: "A",
    number: 84,
    category: "LIVESTOCK_PROVIDER",
    desc: ["In each returning home phase after which there is no harvest, you can pay exactly 1 <GRAIN> - even from a <FIELD> - to breed exactly one type of animal."],
    cost: {},
    prerequisite: "2 Fields",
  },
  impl: cardImpl,
})

export const A084_Silage_impl = A084_Silage.impl
