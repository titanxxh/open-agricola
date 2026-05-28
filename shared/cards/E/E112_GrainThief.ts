import { readCardExtraData } from '../helpers/card-state'
import { gainLeaf } from '../helpers/pay-gain-node'
import type { ActionFlow, FarmTilePosition, Field, PlayerState } from '../../contract/types'
import { fieldTopStack } from '../../domain/field'
import { registerHarvestCountModifier } from '../../actions/helpers/harvest-count-registry'
import type { CardImpl } from '../registry'

const CARD_ID = 'E112_GrainThief'
const E73_CARD_ID = 'E73_Scythe'
const SELECTED_POSITIONS_KEY = 'selectedPositions'
const E73_FULL_REAP_POSITION_KEY = 'fullReapPosition'

const fieldKey = (field: Field) => `${field.row}-${field.col}`

const selectedPositionKeys = (player: PlayerState) =>
  readCardExtraData<string[]>(player, CARD_ID, SELECTED_POSITIONS_KEY) ?? []

const scytheFullReapPosition = (player: PlayerState) =>
  readCardExtraData<string>(player, E73_CARD_ID, E73_FULL_REAP_POSITION_KEY)

const selectableGrainFields = (player: PlayerState) =>
  player.fields.filter((field) => {
    const top = fieldTopStack(field)
    return top?.kind === 'grain' && top.remaining > 0
  })

const positionsForFields = (fields: Field[]): FarmTilePosition[] =>
  fields.map(({ row, col }) => ({ row, col }))

const selectionFlow = (fields: Field[]): ActionFlow => ({
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

const clearSelectionLeaf = (): ActionFlow => ({
  type: 'leaf',
  actionId: 'special-effect',
  sourceCard: CARD_ID,
  params: { kind: 'set-extra-data', key: SELECTED_POSITIONS_KEY, value: undefined },
})

const selectedValidGrainFieldCount = (player: PlayerState) => {
  const selected = new Set(selectedPositionKeys(player))
  const scythePosition = scytheFullReapPosition(player)
  return selectableGrainFields(player)
    .filter((field) => selected.has(fieldKey(field)) && fieldKey(field) !== scythePosition)
    .length
}

registerHarvestCountModifier(CARD_ID, ({ player, field }) => {
  if (!player.occupationPlayed?.includes(CARD_ID)) return
  const selected = new Set(selectedPositionKeys(player))
  if (!selected.has(fieldKey(field))) return
  if (fieldKey(field) === scytheFullReapPosition(player)) return
  const top = fieldTopStack(field)
  if (top?.kind !== 'grain' || top.remaining <= 0) return
  return { delta: -1, sources: [CARD_ID] }
})

export const E112_GrainThief_impl = {
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
    onEndHarvestFieldPhase: (_state, player) => {
      const count = selectedValidGrainFieldCount(player)
      if (selectedPositionKeys(player).length === 0) return
      return {
        type: 'seq',
        children: [
          ...(count > 0 ? [gainLeaf(CARD_ID, { grain: count })] : []),
          clearSelectionLeaf(),
        ],
      } satisfies ActionFlow
    },
  },
  reaches: [] as readonly string[],
} satisfies CardImpl
