import { defineMinorCard } from '../card-source'
import type { ActionDefinition, ActionFlow, PlayerState } from '../../contract/types'
import { payLeaf } from '../helpers/pay-gain-node'
import { isMinorCardId } from '../helpers/card-type'
import { registerAdHocAction } from '../../actions/helpers/ad-hoc-action-registry'
import type { CardImpl } from '../registry'
import { getLogicalFields, mutateLogicalFields } from '../helpers/card-field'

const CARD_ID = 'A084_Silage'
const PAY_GRAIN_ACTION_ID = 'card_A084_Silage_pay-grain-any'

const harvestRounds = [4, 7, 9, 11, 13, 14]

const BREEDABLE_TYPES = ['cattle', 'boar', 'sheep'] as const

const grainFields = (player: PlayerState) => getLogicalFields(player).flatMap((field) => {
  const top = [...field.slots].reverse().find((slot) => slot.stack)
  return top?.stack?.kind === 'grain' ? [{ field, top }] : []
})

const payGrainAnyAction: ActionDefinition = {
  id: PAY_GRAIN_ACTION_ID,
  nameKey: 'actions.pay-grain-any.name',
  descriptionKey: 'actions.pay-grain-any.description',
  roundAvailable: 1,
  gainPerRound: {},
  canBeExecutedByPlayer: (_state, player) => player.resources.grain > 0 || grainFields(player).length > 0,
  getBaseChoiceOptions: ({ player }) => [
    ...(player.resources.grain > 0 ? [{ value: 'reserve', labelKey: 'ui.cards.A084_Silage.reserve' }] : []),
    ...grainFields(player).map(({ field }) => ({
      value: field.id,
      labelKey: field.sourceCard
        ? `${isMinorCardId(field.sourceCard) ? 'minorImprovements' : 'occupations'}.${field.sourceCard}.name`
        : 'ui.cards.A084_Silage.field',
      labelParams: { row: field.row + 1, col: field.col + 1 },
    })),
  ],
  execute: () => ({ type: 'fail', errorKey: 'log.exchangeFail' }),
  resolveChoice: ({ state, player, eventSink }, choice) => {
    if (choice === 'reserve' && player.resources.grain > 0) {
      return { type: 'flow', flow: payLeaf({ cardId: CARD_ID, cost: { grain: 1 } }) }
    }
    const grainField = grainFields(player).find(({ field }) => field.id === choice)
    if (!grainField) return { type: 'fail', errorKey: 'log.exchangeFail' }
    const removed = mutateLogicalFields(state, player, { sourceCard: CARD_ID, eventSink })
      .remove({ fieldId: grainField.field.id, slot: grainField.top.index }, 1)
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
