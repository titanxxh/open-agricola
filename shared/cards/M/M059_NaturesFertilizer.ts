import { defineMinorCard } from '../card-source'
import type { CardListenerContext, CardListenerRegistration } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { buildSowFarmInteraction } from '../../domain/farmyard'
import { parsePositionKey, positionKey } from '../../domain/farm'
import type { FarmTilePosition } from '../../contract/types'
import type { CardImpl } from '../registry'
import { majorImprovementCount } from './moor-batch1-helpers'
import { writeCardExtraData } from '../helpers/card-state'

const CARD_ID = 'M059_NaturesFertilizer'

const isPosition = (value: unknown): value is FarmTilePosition => {
  if (!value || typeof value !== 'object') return false
  const pos = value as Partial<FarmTilePosition>
  return typeof pos.row === 'number' && typeof pos.col === 'number'
}

const slashAndBurnFields = (context: CardListenerContext): FarmTilePosition[] => {
  const payload = context.extraData?.payload
  if (!payload || typeof payload !== 'object') return []
  const tile = (payload as { tile?: unknown }).tile
  return isPosition(tile) ? [{ row: tile.row, col: tile.col }] : []
}

const terrainSelectionFields = (context: CardListenerContext): FarmTilePosition[] => {
  if (context.actionContext?.terrainMode !== 'replace-with-field') return []
  const extraData = context.result && context.result.type !== 'fail' ? context.result.extraData : undefined
  const selected = extraData?.selectedPositions
  if (!Array.isArray(selected)) return []
  return selected.flatMap((entry) =>
    typeof entry === 'string'
      ? (parsePositionKey(entry) ? [parsePositionKey(entry)!] : [])
      : [])
}

const sowFlow = (context: CardListenerContext, fields: FarmTilePosition[]) => {
  if (fields.length === 0) return
  writeCardExtraData(context.player, CARD_ID, 'selectedPositions', fields.map(positionKey))
  const actionContext = {
    minSelections: 1,
    maxSelections: fields.length,
    allowedFields: 'fromSelectedFields',
    sourceCard: CARD_ID,
  }
  const farm = buildSowFarmInteraction(context.player, actionContext)
  if (farm.farmType !== 'sow' || farm.selectableFields.length === 0) return
  return {
    type: 'leaf' as const,
    actionId: 'sow',
    sourceCard: CARD_ID,
    actionContext,
  }
}

const listener: CardListenerRegistration = {
  id: 'M059-natures-fertilizer-after-terrain-field',
  cardIds: [CARD_ID],
  phases: ['after' as ActionHookPhase],
  actions: ['slash-and-burn', 'selection'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    const flow = sowFlow(
      context,
      context.actionId === 'slash-and-burn'
        ? slashAndBurnFields(context)
        : terrainSelectionFields(context),
    )
    if (!flow) return
    return { flow, sourceCard: CARD_ID }
  },
}

const cardImpl = {
  prerequisiteCheck: (player) => majorImprovementCount(player) >= 1,
  listeners: [listener],
  reaches: [] as readonly string[],
} satisfies CardImpl

export const M059_NaturesFertilizer = defineMinorCard({
  meta: {
    id: CARD_ID,
    name: "Nature's Fertilizer",
    deck: "M",
    number: 59,
    category: "ACTIONS_BOOSTER",
    desc: [
        "Each time after you take the \"Slash and Burn\" special action, you also get a \"Sow\" action for the new field only. This also applies when you exchange 1 moor for 1 field tile via a minor improvement."
    ],
    cost: {
        "vegetable": 2,
        "boar": 1
    },
    prerequisite: "1 Major Improvement",
    implemented: true,
    requiresFarmersOfTheMoor: true,
  },
  impl: cardImpl,
})

export const M059_NaturesFertilizer_impl = M059_NaturesFertilizer.impl
