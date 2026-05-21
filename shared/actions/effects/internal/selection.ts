import type { ActionDefinition } from '../../../contract/types'
import { writeCardExtraData } from '../../../cards/helpers/card-state'
import { runSelectionEffect } from '../../helpers/selection-effect-registry'

const validateFarmPositions = (
  positions: string[],
  actionContext: Record<string, unknown> | undefined,
) => {
  const hasSelectionBounds = actionContext?.minSelections !== undefined
    || actionContext?.maxSelections !== undefined
    || Array.isArray(actionContext?.selectableTiles)
  if (!hasSelectionBounds) return null

  const minSelections = (actionContext?.minSelections as number | undefined) ?? 0
  const maxSelections = actionContext?.maxSelections as number | undefined
  if (positions.length < minSelections) return 'not enough selection positions'
  if (maxSelections !== undefined && positions.length > maxSelections) {
    return 'too many selection positions'
  }

  const selected = new Set<string>()
  for (const position of positions) {
    if (selected.has(position)) return 'duplicate selection position'
    selected.add(position)
  }

  const selectableTiles = Array.isArray(actionContext?.selectableTiles)
    ? actionContext.selectableTiles as Array<{ row: number; col: number }>
    : null
  if (selectableTiles) {
    const selectable = new Set(selectableTiles.map((pos) => `${pos.row}-${pos.col}`))
    for (const position of positions) {
      if (!selectable.has(position)) return 'invalid selection position'
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
    return {
      type: 'request',
      request: {
        kind: 'choice',
        options: [
          { value: 'confirm', labelKey: 'ui.interactionSelectionConfirm' },
          { value: 'cancel', labelKey: 'ui.interactionCancel' },
        ],
      },
      promptKey,
      promptParams: { maxSelections },
    }
  },
  resolveChoice: ({ player, sourceCard, actionContext, state }, choice, payload) => {
    // Prefer structured payload (S2 Task 7); fall back to legacy split-comma
    // string encoding from `commitSelectionChoice` for unmigrated callsites.
    const payloadPositions = (payload as { positions?: string[] } | undefined)?.positions
    const payloadCards = (payload as { cards?: string[] } | undefined)?.cards
    const positions = choice === 'cancel'
      ? []
      : Array.isArray(payloadPositions)
      ? payloadPositions
      : choice.split(',').filter(Boolean)
    const cards = Array.isArray(payloadCards) ? payloadCards : []
    const kind = (actionContext?.selectionKind as string | undefined) ?? 'farm-position'
    if (kind === 'farm-position') {
      const validationError = validateFarmPositions(positions, actionContext)
      if (validationError) return { type: 'fail', errorKey: validationError, recoverable: true }
    }
    if (choice === 'cancel') return { type: 'ok' }

    if (sourceCard) {
      // farm-position selectedPositions stored as "r-c" strings (legacy);
      // occupation-hand picks store the card-id list under the same key for
      // any effect that wants to inspect the selection.
      const stored = cards.length > 0 ? cards : positions
      writeCardExtraData(player, sourceCard, 'selectedPositions', stored)
    }

    const effect = actionContext?.selectionEffect as string | undefined
    const extraData: Record<string, unknown> = { selectedPositions: positions }
    if (cards.length > 0) extraData.selectedCards = cards
    if (effect) {
      const followup = runSelectionEffect(effect, { player, positions, cards, sourceCard, state })
      if (followup) {
        return { type: 'flow', flow: followup, extraData }
      }
    }

    return { type: 'ok', extraData }
  },
}
