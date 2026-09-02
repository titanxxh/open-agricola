import { defineMinorCard } from '../card-source'
import type { ActionDefinition, ActionFlow } from '../../contract/types'
import { registerAdHocAction } from '../../actions/helpers/ad-hoc-action-registry'
import type { CardImpl } from '../registry'
import { getLogicalFields, mutateLogicalFields } from '../helpers/card-field'

const CARD_ID = 'A084_Silage'
const PAY_GRAIN_ACTION_ID = 'card_A084_Silage_pay-grain-any'

const harvestRounds = [4, 7, 9, 11, 13, 14]

const BREEDABLE_TYPES = ['cattle', 'boar', 'sheep'] as const

const payGrainAnyAction: ActionDefinition = {
  id: PAY_GRAIN_ACTION_ID,
  nameKey: 'actions.pay-grain-any.name',
  descriptionKey: 'actions.pay-grain-any.description',
  roundAvailable: 1,
  gainPerRound: {},
  canBeExecutedByPlayer: () => true,
  execute: ({ state, player, eventSink }) => {
    if (player.resources.grain >= 1) {
      player.resources.grain -= 1
      return { type: 'ok' }
    }
    const grainField = getLogicalFields(player).map((field) => ({
      field,
      top: [...field.slots].reverse().find((slot) => slot.stack),
    })).find(({ top }) => top?.stack?.kind === 'grain')
    if (!grainField?.top) return { type: 'fail', errorKey: 'log.exchangeFail' }
    const removed = mutateLogicalFields(state, player, {
      sourceCard: CARD_ID,
      eventSink,
    }).remove({ fieldId: grainField.field.id, slot: grainField.top.index }, 1)
    if (removed.ok) return removed.flow ? { type: 'flow', flow: removed.flow } : { type: 'ok' }
    return { type: 'fail', errorKey: 'log.exchangeFail' }
  },
}

registerAdHocAction(payGrainAnyAction)

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
      choiceLabelKey: `ui.interactionSilageBreed`,
      choiceLabelParams: { animal: animalType },
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
