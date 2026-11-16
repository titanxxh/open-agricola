import type { GameState } from '../../shared/contract/types'
import type { ClientInteractionState } from '../../shared/contract/protocol/game'
import { draftSeatProgress } from '../../shared/projections/draft-progress'

export type MultihandInput = { playerId: string; key: string }

export function pendingMultihandInputs(state: GameState, controlledPlayerIndexes: readonly number[]): MultihandInput[] {
  const owned = state.players.filter((_, index) => controlledPlayerIndexes.includes(index))
  const draft = state.draft
  if (state.phase === 'draft' && draft) return owned.flatMap(player => {
    const progress = draftSeatProgress(draft, player.id)
    return progress.kind === 'selecting' ? [{ playerId: player.id, key: `draft:${progress.opportunityKey}` }] : []
  })
  const selection = state.parentSelection
  return state.phase === 'parent-selection' && selection
    ? owned.filter(player => !selection.submissions[player.id]).map(player => ({ playerId: player.id, key: 'parents' }))
    : []
}

export function nextMultihandPlayerId(
  state: GameState,
  interaction: ClientInteractionState,
  controlledPlayerIndexes: readonly number[],
  preferred?: MultihandInput | null,
): string | null {
  if (state.phase === 'draft' || state.phase === 'parent-selection') {
    const pending = pendingMultihandInputs(state, controlledPlayerIndexes)
    return (pending.find(input => input.playerId === preferred?.playerId && input.key === preferred.key) ?? pending[0])?.playerId ?? null
  }
  const index = interaction.stateId === 'wait' ? interaction.playerIndex : state.currentPlayerIndex
  return controlledPlayerIndexes.includes(index) ? state.players[index]?.id ?? null : null
}
