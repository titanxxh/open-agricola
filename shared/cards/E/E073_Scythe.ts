import { defineMinorCard } from '../card-source'
import type { ActionDefinition, ActionFlow } from '../../contract/types'
import { fieldTotalRemaining } from '../../domain/field'
import { registerAdHocAction } from '../../actions/helpers/ad-hoc-action-registry'
import { registerHarvestCountModifier } from '../../actions/helpers/harvest-count-registry'
import { readCardExtraData, writeCardExtraData } from '../helpers/card-state'
import type { CardImpl } from '../registry'
import { getLogicalFields } from '../helpers/card-field'

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
    const fieldId = params?.fieldId as string | undefined
    const field = getLogicalFields(player).find((candidate) => candidate.id === fieldId)
    if (!field || field.stacks.reduce((sum, stack) => sum + stack.remaining, 0) < 2) {
      return { type: 'fail', errorKey: 'log.actionFail' }
    }
    const slot = [...field.slots].reverse().find((candidate) => candidate.stack)
    if (!slot) return { type: 'fail', errorKey: 'log.actionFail' }
    writeCardExtraData(player, CARD_ID, FULL_REAP_POSITION_KEY, fieldKey(slot.tile.row, slot.tile.col))
    return { type: 'ok' }
  },
}

registerAdHocAction(scytheHarvestFieldAction)

registerHarvestCountModifier(CARD_ID, ({ player, field, logicalField }) => {
  if (!player.minorPlayed?.includes(CARD_ID)) return
  const selected = readCardExtraData<string>(player, CARD_ID, FULL_REAP_POSITION_KEY)
  const selectedField = logicalField
    ? logicalField.slots.some((slot) => selected === fieldKey(slot.tile.row, slot.tile.col))
    : selected === fieldKey(field.row, field.col)
  if (!selectedField) return
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
      const harvestable = getLogicalFields(player)
        .filter((field) => field.stacks.reduce((sum, stack) => sum + stack.remaining, 0) >= 2)
      if (harvestable.length === 0) return
      const children: ActionFlow[] = harvestable.map((field) => {
        return {
          type: 'leaf' as const,
          actionId: HARVEST_ACTION_ID,
          params: { fieldId: field.id },
          sourceCard: CARD_ID,
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
  presentation: { stack: true },
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
