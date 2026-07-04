import { defineMinorCard } from '../card-source'
import type { ActionDefinition, ActionFlow } from '../../contract/types'
import { fieldTopStack, fieldTotalRemaining } from '../../domain/field'
import { registerAdHocAction } from '../../actions/helpers/ad-hoc-action-registry'
import { registerHarvestCountModifier } from '../../actions/helpers/harvest-count-registry'
import { readCardExtraData, writeCardExtraData } from '../helpers/card-state'
import type { CardImpl } from '../registry'

const CARD_ID = 'E073_Scythe'

const HARVEST_ACTION_ID = 'card_E073_Scythe_harvest-field'
const FULL_REAP_POSITION_KEY = 'fullReapPosition'

const fieldKey = (row: number, col: number) => `${row}-${col}`

const scytheHarvestFieldAction: ActionDefinition = {
  id: HARVEST_ACTION_ID,
  nameKey: 'actions.scythe-harvest-field.name',
  descriptionKey: 'actions.scythe-harvest-field.description',
  roundAvailable: 1,
  gainPerRound: {},
  canBeExecutedByPlayer: () => true,
  execute: ({ player, params }) => {
    const fieldIndex = params?.fieldIndex as number | undefined
    if (fieldIndex === undefined) return { type: 'fail', errorKey: 'log.actionFail' }
    const field = player.fields[fieldIndex]
    if (!field || fieldTotalRemaining(field) < 2) return { type: 'fail', errorKey: 'log.actionFail' }
    writeCardExtraData(player, CARD_ID, FULL_REAP_POSITION_KEY, fieldKey(field.row, field.col))
    return { type: 'ok' }
  },
}

registerAdHocAction(scytheHarvestFieldAction)

registerHarvestCountModifier(CARD_ID, ({ player, field }) => {
  if (!player.minorPlayed?.includes(CARD_ID)) return
  const selected = readCardExtraData<string>(player, CARD_ID, FULL_REAP_POSITION_KEY)
  if (selected !== fieldKey(field.row, field.col)) return
  return {
    override: fieldTotalRemaining(field),
    sources: [CARD_ID],
    tags: ['full-field-reap'],
    scope: 'field',
  }
})

const cardImpl = {
  effect: {
    id: CARD_ID,
    onStartHarvestFieldPhase: (_state, player) => {
      const harvestable = player.fields
        .map((f, i) => ({ field: f, index: i }))
        .filter(({ field }) => fieldTotalRemaining(field) >= 2)
      if (harvestable.length === 0) return
      const children: ActionFlow[] = harvestable.map(({ field, index }) => {
        const top = fieldTopStack(field)
        const total = fieldTotalRemaining(field)
        return {
          type: 'leaf' as const,
          actionId: HARVEST_ACTION_ID,
          params: { fieldIndex: index },
          sourceCard: CARD_ID,
          choiceLabelKey: 'ui.interactionScytheField',
          choiceLabelParams: { crop: top?.kind ?? null, amount: total },
        }
      })
      return { type: 'xor', optional: true, children }
    },
    onEndHarvest: () => ({
      type: 'leaf',
      actionId: 'special-effect',
      sourceCard: CARD_ID,
      params: { kind: 'set-extra-data', key: FULL_REAP_POSITION_KEY, value: undefined },
    }),
  },
  reaches: [] as readonly string[],
} satisfies CardImpl

export const E073_Scythe = defineMinorCard({
  meta: {
    id: "E073_Scythe",
    name: "Scythe",
    deck: "E",
    number: 73,
    desc: ["During the field phase of each harvest, you can select exactly one of your <FIELD> and harvest all the crops planted in it."],
    cost: {"wood":1},
    category: 'CROPS_-_GRAIN_AND_VEGETABLE',
  },
  impl: cardImpl,
})

export const E073_Scythe_impl = E073_Scythe.impl
