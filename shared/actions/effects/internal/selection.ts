import type { ActionDefinition, PlayerState } from '../../../contract/types'
import { writeCardExtraData, writePrivateCardData } from '../../../cards/helpers/card-state'
import {
  buildFarmPositionSelectionRequest,
  validateFarmPositionSelection,
} from '../../../domain/farm-position-selection'
import { runSelectionEffect, validateSelectionEffect } from '../../helpers/selection-effect-registry'
import { buildFarmPositionSelectionInteraction } from '../../../domain/farmyard-interaction'
import { validateOccupationHandSelection } from '../../../domain/occupation-hand-selection'

const validateFarmPositions = (
  positions: string[],
  actionContext: Record<string, unknown> | undefined,
  player: PlayerState,
) => {
  const request = buildFarmPositionSelectionRequest(player, actionContext)
  if (!request.hasConstraints) return { ok: true as const, positionStrings: positions }
  return validateFarmPositionSelection({ request, positions })
}

export const selectionAction: ActionDefinition = {
  id: 'selection',
  nameKey: 'actions.selection.name',
  descriptionKey: 'actions.selection.description',
  roundAvailable: 1,
  gainPerRound: {},
  canBeExecutedByPlayer: () => true,
  execute: ({ player, actionContext }) => {
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
        kind: 'selection',
        selection: kind === 'occupation-hand'
          ? { kind: 'occupation-hand', selectableCards: player.occupationHand, maxSelections, minSelections }
          : buildFarmPositionSelectionInteraction(player, actionContext),
        options: [{ value: 'confirm', labelKey: 'ui.interactionSelectionConfirm' }],
      },
      promptKey,
      promptParams: { maxSelections, minSelections },
    }
  },
  resolveChoice: ({
    player,
    sourceCard,
    actionContext,
    state,
    eventSink,
    reportProtectedObservation,
  }, choice, payload) => {
    if (choice === 'cancel') return { type: 'fail', errorKey: 'log.action', recoverable: true }

    const payloadPositions = (payload as { positions?: string[] } | undefined)?.positions
    const payloadCards = (payload as { cards?: string[] } | undefined)?.cards
    let positions = Array.isArray(payloadPositions)
      ? payloadPositions
      : []
    const cards = Array.isArray(payloadCards) ? payloadCards : []
    const kind = (actionContext?.selectionKind as string | undefined) ?? 'farm-position'
    if (kind === 'farm-position') {
      const validation = validateFarmPositions(positions, actionContext, player)
      if (!validation.ok) return { type: 'fail', errorKey: validation.error, recoverable: true }
      positions = validation.positionStrings
    }
    if (kind === 'occupation-hand') {
      const validation = validateOccupationHandSelection({ cards, hand: player.occupationHand,
        minSelections: (actionContext?.minSelections as number | undefined) ?? 1,
        maxSelections: actionContext?.maxSelections as number | undefined })
      if (!validation.ok) return { type: 'fail', errorKey: validation.error, recoverable: true }
    }
    const effect = actionContext?.selectionEffect as string | undefined
    if (effect) {
      const validationError = validateSelectionEffect(effect, {
        player,
        positions,
        cards,
        sourceCard,
        state,
        actionContext,
        reportProtectedObservation,
      })
      if (validationError) return { type: 'fail', errorKey: validationError, recoverable: true }
    }

    if (sourceCard) {
      // Board coordinates are internal; occupation subsets belong to the selecting player.
      const stored = cards.length > 0 ? cards : positions
      if (kind === 'occupation-hand') writePrivateCardData(player, sourceCard, 'selectedPositions', stored)
      else writeCardExtraData(player, sourceCard, 'selectedPositions', stored)
    }

    const extraData: Record<string, unknown> = { selectedPositions: positions }
    if (kind === 'occupation-hand' || cards.length > 0) extraData.selectedCards = cards
    if (effect) {
      const followup = runSelectionEffect(effect, {
        player,
        positions,
        cards,
        sourceCard,
        state,
        actionContext,
        eventSink,
        reportProtectedObservation,
      })
      if (followup) {
        return { type: 'flow', flow: followup, extraData }
      }
    }

    return { type: 'ok', extraData }
  },
}
