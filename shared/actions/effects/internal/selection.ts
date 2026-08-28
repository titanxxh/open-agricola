import type { ActionDefinition, PlayerState } from '../../../contract/types'
import { writeCardExtraData } from '../../../cards/helpers/card-state'
import {
  buildFarmPositionSelectionRequest,
  validateFarmPositionSelection,
} from '../../../domain/farm-position-selection'
import { runSelectionEffect, validateSelectionEffect } from '../../helpers/selection-effect-registry'

const validateFarmPositions = (
  positions: string[],
  actionContext: Record<string, unknown> | undefined,
  player: PlayerState,
) => {
  const request = buildFarmPositionSelectionRequest(player, actionContext)
  if (!request.hasConstraints) return { ok: true as const, positionStrings: positions }
  return validateFarmPositionSelection({ request, positions })
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
      const validationError = validateOccupationCards(cards, player.occupationHand, actionContext)
      if (validationError) return { type: 'fail', errorKey: validationError, recoverable: true }
    }
    const effect = actionContext?.selectionEffect as string | undefined
    if (effect) {
      const validationError = validateSelectionEffect(effect, { player, positions, cards, sourceCard, state, actionContext })
      if (validationError) return { type: 'fail', errorKey: validationError, recoverable: true }
    }

    if (sourceCard) {
      // selectedPositions keeps the existing extra-data key:
      // positions for board selections, card ids for card selections.
      const stored = cards.length > 0 ? cards : positions
      writeCardExtraData(player, sourceCard, 'selectedPositions', stored)
    }

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
