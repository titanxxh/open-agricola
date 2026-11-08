import type { GameState } from '../../shared/contract/types'
import type { ClientInteractionState } from '../../shared/contract/protocol/game'
import { draftSeatProgress } from '../../shared/projections/draft-progress'

export function nextMultihandPlayerId(
  state: GameState,
  interaction: ClientInteractionState,
  controlledPlayerIndexes: readonly number[],
): string | null {
  const owned = state.players.filter((_, index) => controlledPlayerIndexes.includes(index))
  const draft = state.draft
  if (state.phase === 'draft' && draft) {
    return owned.find(player => draftSeatProgress(draft, player.id).kind === 'selecting')?.id ?? null
  }
  const selection = state.parentSelection
  if (state.phase === 'parent-selection' && selection) {
    return owned.find(player => !selection.submissions[player.id])?.id ?? null
  }
  const index = interaction.stateId === 'wait' ? interaction.playerIndex : state.currentPlayerIndex
  return controlledPlayerIndexes.includes(index) ? state.players[index]?.id ?? null : null
}
