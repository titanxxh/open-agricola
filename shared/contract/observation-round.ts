import type { GameState } from './types'

export type ObservationRoundState = Pick<GameState, 'round' | 'phase' | 'gameOver'>
/** Return the displayed game round, never the independent draft pick round. */
export function observationRound(state?: ObservationRoundState): string {
  if (!state) return 'none'
  if (state.gameOver || (state.phase === 'playing' && state.round === 15)) return 'postgame'
  if (state.phase === 'draft' || state.phase === 'parent-selection') return 'pregame'
  return Number.isInteger(state.round) && state.round >= 1 && state.round <= 14 ? String(state.round) : 'unknown'
}
