import { MinorImprovement } from '../types'
import type { ActionDefinition, ActionFlow } from '../../game/types'
import { fieldIsEmpty, fieldTopStack } from '../../game/field'
import { registerAdHocAction } from '../../actions/helpers/ad-hoc-action-registry'
import type { CardImpl } from '../registry'

const CARD_ID = 'E73_Scythe'
const HARVEST_ACTION_ID = 'card_E73_Scythe_harvest-field'

const scytheHarvestFieldAction: ActionDefinition = {
  id: HARVEST_ACTION_ID,
  nameKey: 'actions.scythe-harvest-field.name',
  descriptionKey: 'actions.scythe-harvest-field.description',
  roundAvailable: 1,
  gainPerRound: {},
  canBeExecutedByPlayer: () => true,
  execute: ({ player, params, sourceCard }) => {
    const fieldIndex = params?.fieldIndex as number | undefined
    if (fieldIndex === undefined) return { type: 'fail', logKey: 'log.actionFail' }
    const field = player.fields[fieldIndex]
    if (!field) return { type: 'fail', logKey: 'log.actionFail' }
    const top = fieldTopStack(field)
    if (!top || top.remaining <= 0) return { type: 'fail', logKey: 'log.actionFail' }
    const crop = top.kind
    const amount = top.remaining
    player.resources[crop] = (player.resources[crop] ?? 0) + amount
    field.stacks.pop()
    return {
      type: 'ok',
      resourcesGained: { [crop]: amount },
      logKey: 'log.cardEffectGain',
      logParams: { gain: { [crop]: amount }, cardId: sourceCard },
    }
  },
}
registerAdHocAction(scytheHarvestFieldAction)

export const E73_Scythe = new MinorImprovement({
  id: "E73_Scythe",
  name: "Scythe",
  deck: "E",
  number: 73,
  desc: ["During the field phase of each harvest, you can select exactly one of your fields and harvest all the crops planted in it."],
  cost: {"wood":1},
})

export const E73_Scythe_impl = {
  effect: {
  id: CARD_ID,
  onStartHarvestFieldPhase: (_state, player) => {
    const harvestable = player.fields
      .map((f, i) => ({ field: f, index: i }))
      .filter(({ field }) => !fieldIsEmpty(field))
    if (harvestable.length === 0) return
    const children: ActionFlow[] = harvestable.map(({ field, index }) => {
      const top = fieldTopStack(field)
      return {
        type: 'leaf' as const,
        actionId: HARVEST_ACTION_ID,
        params: { fieldIndex: index },
        sourceCard: CARD_ID,
        choiceLabelKey: 'ui.interactionScytheField',
        choiceLabelParams: { crop: top?.kind ?? null, amount: top?.remaining ?? 0 },
      }
    })
    return { type: 'xor', optional: true, children }
  },
},
  reaches: [] as readonly string[],
} satisfies CardImpl
