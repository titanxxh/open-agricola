import { defineOccupationCard } from '../card-source'
import { readCardExtraData } from '../helpers/card-state'
import type { ActionFlow, PlayerState } from '../../contract/types'
import { fieldTopStack } from '../../domain/field'
import {
  registerHarvestCountModifier,
  registerHarvestSelectionThresholdModifier,
} from '../../actions/helpers/harvest-count-registry'
import type { CardImpl } from '../registry'
import { getLogicalFields, type LogicalField } from '../helpers/card-field'

const CARD_ID = 'E112_GrainThief'
const SELECTED_POSITIONS_KEY = 'selectedPositions'

const fieldKey = (field: { row: number; col: number }) => `${field.row}-${field.col}`

const selectedPositionKeys = (player: PlayerState) =>
  readCardExtraData<string[]>(player, CARD_ID, SELECTED_POSITIONS_KEY) ?? []

const selectableGrainFields = (player: PlayerState) =>
  getLogicalFields(player).filter((field) =>
    field.stacks.at(-1)?.kind === 'grain' && field.stacks.at(-1)!.remaining > 0,
  )

const positionsForFields = (fields: readonly LogicalField[]) =>
  fields.flatMap((field) => {
    if (field.kind === 'farmyard') return [{ row: field.row, col: field.col }]
    const slot = [...field.slots].reverse().find((candidate) => candidate.stack?.kind === 'grain')
    return slot ? [{
      ...slot.tile,
      sourceCard: field.sourceCard,
      groupKey: field.groupKey,
      cardFieldSlot: slot.index,
    }] : []
  })

const selectionFlow = (fields: readonly LogicalField[]): ActionFlow => ({
  type: 'leaf',
  actionId: 'selection',
  sourceCard: CARD_ID,
  actionContext: {
    selectionKind: 'farm-position',
    selectableTiles: positionsForFields(fields),
    minSelections: 1,
    maxSelections: fields.length,
  },
})

registerHarvestCountModifier(CARD_ID, ({ player, field, logicalField }) => {
  if (!player.occupationPlayed?.includes(CARD_ID)) return
  const selected = new Set(selectedPositionKeys(player))
  const selectedField = logicalField
    ? logicalField.slots.some((slot) => selected.has(fieldKey(slot.tile)))
    : selected.has(fieldKey(field))
  if (!selectedField) return
  const top = fieldTopStack(field)
  if (top?.kind !== 'grain' || top.remaining <= 0) return
  return { delta: -1, sources: [CARD_ID], tags: ['supply-instead-of-field'] }
})

registerHarvestSelectionThresholdModifier(CARD_ID, ({ player, field, logicalField }) => {
  if (!player.occupationPlayed?.includes(CARD_ID)) return
  if (!logicalField) return
  const top = fieldTopStack(field)
  if (top?.kind !== 'grain') return
  return { threshold: 1, sources: [CARD_ID] }
})

const cardImpl = {
  effect: {
    id: CARD_ID,
    onStartHarvestFieldPhase: (_state, player) => {
      const fields = selectableGrainFields(player)
      if (fields.length === 0) return
      return {
        type: 'seq',
        optional: true,
        children: [selectionFlow(fields)],
      } satisfies ActionFlow
    },
    timedRules: [{ retainAfterCardLeaves: true, key: 'selected-harvest-supply', at: { kind: 'card-list-nonempty', fact: SELECTED_POSITIONS_KEY, phase: 'onEndHarvestFieldPhase' }, body: {
      kind: 'operation', operation: { kind: 'harvest-selected-supply-reward', crop: 'grain', selectionFact: SELECTED_POSITIONS_KEY, applicationTag: 'supply-instead-of-field', excludedTag: 'full-field-reap' },
    } }],
  },
  reaches: [] as readonly string[],
} satisfies CardImpl

export const E112_GrainThief = defineOccupationCard({
  presentation: { stack: true },
  meta: {
    id: "E112_GrainThief",
    name: "Grain Thief",
    deck: "E",
    number: 112,
    desc: ["Each time you would harvest a <GRAIN> <FIELD>, you can leave the <GRAIN> on the <FIELD> and take 1 <GRAIN> from the general supply instead."],
    cost: {},
    players: "1+",
    category: 'CROPS_-_GRAIN',
  },
  impl: cardImpl,
})

export const E112_GrainThief_impl = E112_GrainThief.impl
