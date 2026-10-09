import type { GameState, PlayerState } from '../../contract/types'

/** Resolve the declared recipient with the execution's actor fallback. */
export const resolveActionTargetPlayer = (state: GameState | undefined, actor: PlayerState, actionContext: Record<string, unknown> | undefined): PlayerState => {
  const targetId = actionContext?.targetPlayerId
  if (typeof targetId !== 'string' || !targetId) return actor
  return state?.players.find((player) => player.id === targetId) ?? actor
}
