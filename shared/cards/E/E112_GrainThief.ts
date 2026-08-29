import { defineOccupationCard } from '../card-source'
import { readCardExtraData } from '../helpers/card-state'
import { gainLeaf } from '../helpers/pay-gain-node'
import type { ActionFlow, FarmTilePosition, Field, GameState, PlayerState } from '../../contract/types'
import { fieldTopStack } from '../../domain/field'
import {
  registerHarvestCountModifier,
  registerHarvestSelectionThresholdModifier,
} from '../../actions/helpers/harvest-count-registry'
import type { CardImpl } from '../registry'

const CARD_ID = 'E112_GrainThief'
const SELECTED_POSITIONS_KEY = 'selectedPositions'

const fieldKey = (field: Field) => `${field.row}-${field.col}`

const selectedPositionKeys = (player: PlayerState) =>
  readCardExtraData<string[]>(player, CARD_ID, SELECTED_POSITIONS_KEY) ?? []

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

const selectedSupplyApplicationCount = (state: GameState, player: PlayerState) => {
  const selected = new Set(selectedPositionKeys(player))
  const counted = new Set<string>()
  for (const app of state.harvestReapSummary?.[player.id]?.harvestCountApplications ?? []) {
    if (app.crop !== 'grain') continue
    const key = `${app.row}-${app.col}`
    if (!selected.has(key)) continue
    if (!app.tags.includes('supply-instead-of-field')) continue
    if (app.tags.includes('full-field-reap')) continue
    counted.add(key)
  }
  return counted.size
}

registerHarvestCountModifier(CARD_ID, ({ player, field }) => {
  if (!player.occupationPlayed?.includes(CARD_ID)) return
  const selected = new Set(selectedPositionKeys(player))
  if (!selected.has(fieldKey(field))) return
  const top = fieldTopStack(field)
  if (top?.kind !== 'grain' || top.remaining <= 0) return
  return { delta: -1, sources: [CARD_ID], tags: ['supply-instead-of-field'] }
})

registerHarvestSelectionThresholdModifier(CARD_ID, ({ player, field }) => {
  if (!player.occupationPlayed?.includes(CARD_ID)) return
  if (!player.fields.some((candidate) => fieldKey(candidate) === fieldKey(field))) return
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
    onEndHarvestFieldPhase: (state, player) => {
      const count = selectedSupplyApplicationCount(state, player)
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

export const E112_GrainThief = defineOccupationCard({
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
