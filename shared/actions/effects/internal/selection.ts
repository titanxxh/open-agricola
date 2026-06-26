import type { ActionDefinition, GameState, PlayerState } from '../../../contract/types'
import { writeCardExtraData } from '../../../cards/helpers/card-state'
import { playerBoard } from '../../../domain'
import { getUsedFarmyardTileKeys } from '../../../domain/farm'
import { runSelectionEffect } from '../../helpers/selection-effect-registry'

const validateFarmPositions = (
  positions: string[],
  actionContext: Record<string, unknown> | undefined,
  state: GameState | undefined,
  player: PlayerState,
) => {
  const hasSelectionBounds = actionContext?.minSelections !== undefined
    || actionContext?.maxSelections !== undefined
    || actionContext?.positionFilter !== undefined
    || Array.isArray(actionContext?.selectableTiles)
  if (!hasSelectionBounds) return null

  const minSelections = (actionContext?.minSelections as number | undefined) ?? 1
  const maxSelections = actionContext?.maxSelections as number | undefined
  if (positions.length < minSelections) return 'not enough selection positions'
  if (maxSelections !== undefined && positions.length > maxSelections) {
    return 'too many selection positions'
  }

  const selected = new Set<string>()
  const requireUnusedTerrainTile = actionContext?.terrainMode === 'place'
  const usedFarmyardTiles = requireUnusedTerrainTile
    ? getUsedFarmyardTileKeys(player)
    : null
  for (const position of positions) {
    if (selected.has(position)) return 'duplicate selection position'
    selected.add(position)
    if (usedFarmyardTiles?.has(position)) return 'invalid selection position'
  }

  const playerIndex = state?.players.indexOf(player) ?? -1
  if (state && playerIndex >= 0) {
    const selectionInteraction = playerBoard(state, playerIndex)
      .farmyard
      .selectableTiles('farm-position', { actionContext })
    const selectablePositions = selectionInteraction.kind === 'farm-position'
      ? selectionInteraction.selectablePositions
      : []
    const selectable = new Set(selectablePositions.map((pos) => `${pos.row}-${pos.col}`))
    for (const position of positions) {
      if (!selectable.has(position)) return 'invalid selection position'
    }
  } else {
    const selectableTiles = Array.isArray(actionContext?.selectableTiles)
      ? actionContext.selectableTiles as Array<{ row: number; col: number }>
      : null
    if (selectableTiles) {
      const selectable = new Set(selectableTiles.map((pos) => `${pos.row}-${pos.col}`))
      for (const position of positions) {
        if (!selectable.has(position)) return 'invalid selection position'
      }
    }
  }

  const allowedSelectionCounts = Array.isArray(actionContext?.allowedSelectionCounts)
    ? actionContext.allowedSelectionCounts
        .filter((count): count is number => typeof count === 'number' && Number.isInteger(count))
    : null
  if (allowedSelectionCounts && !allowedSelectionCounts.includes(positions.length)) {
    return 'invalid selection count'
  }

  return null
}

const validateOccupationCards = (
  cards: string[],
  playerHand: string[],
  actionContext: Record<string, unknown> | undefined,
) => {
  const minSelections = (actionContext?.minSelections as number | undefined) ?? 1
  const maxSelections = actionContext?.maxSelections as number | undefined
  if (cards.length < minSelections) return 'not enough card selections'
  if (maxSelections !== undefined && cards.length > maxSelections) {
    return 'too many card selections'
  }
  for (const card of cards) {
    if (!playerHand.includes(card)) return `card ${card} not in occupation hand`
  }
  return null
}

export const selectionAction: ActionDefinition = {
  id: 'selection',
  nameKey: 'actions.selection.name',
  descriptionKey: 'actions.selection.description',
  roundAvailable: 1,
  gainPerRound: {},
  canBeExecutedByPlayer: () => true,
  execute: ({ actionContext }) => {
    const kind = (actionContext?.selectionKind as string | undefined) ?? 'farm-position'
    const promptKey =
      kind === 'occupation-hand'
        ? 'ui.interactionOccupationHand'
        : 'ui.interactionSelection'
    const maxSelections = (actionContext?.maxSelections as number) ?? 1
    const minSelections = (actionContext?.minSelections as number) ?? 1
    return {
      type: 'request',
      request: {
        kind: 'choice',
        options: [
          { value: 'confirm', labelKey: 'ui.interactionSelectionConfirm' },
        ],
      },
      promptKey,
      promptParams: { maxSelections, minSelections },
    }
  },
  resolveChoice: ({ player, sourceCard, actionContext, state }, choice, payload) => {
    if (choice === 'cancel') return { type: 'fail', errorKey: 'log.action', recoverable: true }

    const payloadPositions = (payload as { positions?: string[] } | undefined)?.positions
    const payloadCards = (payload as { cards?: string[] } | undefined)?.cards
    const positions = Array.isArray(payloadPositions)
      ? payloadPositions
      : []
    const cards = Array.isArray(payloadCards) ? payloadCards : []
    const kind = (actionContext?.selectionKind as string | undefined) ?? 'farm-position'
    if (kind === 'farm-position') {
      const validationError = validateFarmPositions(positions, actionContext, state, player)
      if (validationError) return { type: 'fail', errorKey: validationError, recoverable: true }
    }
    if (kind === 'occupation-hand') {
      const validationError = validateOccupationCards(cards, player.occupationHand, actionContext)
      if (validationError) return { type: 'fail', errorKey: validationError, recoverable: true }
    }

    if (sourceCard) {
      // selectedPositions keeps the existing extra-data key:
      // positions for board selections, card ids for card selections.
      const stored = cards.length > 0 ? cards : positions
      writeCardExtraData(player, sourceCard, 'selectedPositions', stored)
    }

    const effect = actionContext?.selectionEffect as string | undefined
    const extraData: Record<string, unknown> = { selectedPositions: positions }
    if (kind === 'occupation-hand' || cards.length > 0) extraData.selectedCards = cards
    if (effect) {
      const followup = runSelectionEffect(effect, { player, positions, cards, sourceCard, state, actionContext })
      if (followup) {
        return { type: 'flow', flow: followup, extraData }
      }
    }

    return { type: 'ok', extraData }
  },
}
