import type { ActionDefinition } from '../../../game/types'
import { writeCardExtraData } from '../../../cards/helpers/card-state'
import { runSelectionEffect } from '../../helpers/selection-effect-registry'

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
    if (choice === 'cancel') return { type: 'ok' }

    // Prefer structured payload (S2 Task 7); fall back to legacy split-comma
    // string encoding from `commitSelectionChoice` for unmigrated callsites.
    const payloadPositions = (payload as { positions?: string[] } | undefined)?.positions
    const payloadCards = (payload as { cards?: string[] } | undefined)?.cards
    const positions = Array.isArray(payloadPositions)
      ? payloadPositions
      : choice.split(',').filter(Boolean)
    const cards = Array.isArray(payloadCards) ? payloadCards : []

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
