import type { ClientInteractionState } from '../../../shared/contract/protocol/game'
import type { GameState } from '../../../shared/contract/types'
import { computeDraftViewModel } from '../draft/DraftOverlay'
import { interactionFocusRequestKey } from '../interaction-focus'
import { computeParentSelectionViewModel } from '../parents/ParentSelectionOverlay'

/**
 * Identity of the input window the local player can act in, or null while they
 * cannot. Built only from the projected interaction and setup progress, so it
 * never decides what a command would be allowed to do.
 */
export function encyclopediaAttentionWindow({ state, interaction, playerId }: {
  state: GameState
  interaction: ClientInteractionState
  playerId: string | null | undefined
}): string | null {
  if (!playerId || state.gameOver) return null
  if (state.phase === 'draft') {
    if (!state.draft || computeDraftViewModel(state.draft, playerId).alreadySubmitted) return null
    return `draft:${state.draft.round}:${state.draft.stage ?? 'standard'}`
  }
  if (state.phase === 'parent-selection') {
    if (!state.parentSelection) return null
    const parents = computeParentSelectionViewModel(state.parentSelection, playerId)
    return parents.alreadySubmitted || !parents.canSeeCandidates ? null : 'parent-selection'
  }
  if (interaction.allowedCommands.length === 0) return null
  if (interaction.stateId === 'wait' && interaction.request.kind === 'private-prompt') return null
  const actorIndex = interaction.stateId === 'wait' ? interaction.playerIndex : state.currentPlayerIndex
  if (state.players[actorIndex]?.id !== playerId) return null
  return `${playerId}:${interactionFocusRequestKey(interaction)}`
}

export type EncyclopediaAttention = { window: string | null; pending: boolean }

export const initialEncyclopediaAttention = (window: string | null): EncyclopediaAttention =>
  ({ window, pending: false })

/** The window present when the panel opens is the baseline; only a later new window asks for attention. */
export function nextEncyclopediaAttention(previous: EncyclopediaAttention, window: string | null): EncyclopediaAttention {
  if (window === previous.window) return previous
  return { window, pending: window !== null }
}
