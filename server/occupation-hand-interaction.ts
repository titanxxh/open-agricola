import type { InteractionSelection, PlayerState } from '../shared/game/types.ts'

/**
 * Build the InteractionSelection payload for an "occupation-hand" selection.
 * Reads actionContext: selectableCards (string[]), minSelections, maxSelections.
 * Falls back to the player's current occupationHand if selectableCards is absent.
 */
export const buildOccupationHandSelectionInteraction = (
  player: PlayerState,
  actionContext?: Record<string, unknown>,
): InteractionSelection => {
  const raw = actionContext?.selectableCards
  const selectableCards = Array.isArray(raw)
    ? (raw as unknown[]).filter((v): v is string => typeof v === 'string')
    : player.occupationHand
  const minSelections = (actionContext?.minSelections as number) ?? 1
  const maxSelections = (actionContext?.maxSelections as number) ?? minSelections
  return { kind: 'occupation-hand', selectableCards, minSelections, maxSelections }
}
