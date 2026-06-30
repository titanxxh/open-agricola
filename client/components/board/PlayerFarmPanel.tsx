import type { GameState, PlayerState } from '../../../shared/contract/types'
import { getPlayerPanelSupplySummary } from '../../../shared/domain/player-panel-summary'
import { FarmBoard, type FarmBoardProps } from './FarmBoard'

/**
 * Props for PlayerFarmPanel.
 *
 * The panel resolves which player's farm to render from `state` + `viewedPlayerId`,
 * so callers no longer need to pass `players` / `displayPlayer` directly.
 * `currentPlayer` (the active turn player) is still derived from `state.currentPlayerIndex`.
 *
 * Every other prop is forwarded to the underlying FarmBoard untouched. This keeps
 * the extraction faithful — no behavior change, just a wrapper that hides the
 * `displayPlayer` lookup behind a `viewedPlayerId` string.
 */
export interface PlayerFarmPanelProps
  extends Omit<FarmBoardProps, 'players' | 'currentPlayer' | 'displayPlayer' | 'infirmaryWorkerCount'> {
  state: GameState
  viewedPlayerId: string
}

export function PlayerFarmPanel({
  state,
  viewedPlayerId,
  ...rest
}: PlayerFarmPanelProps) {
  const currentPlayer: PlayerState | undefined = state.players[state.currentPlayerIndex]
  const displayPlayer: PlayerState | undefined =
    state.players.find((p) => p.id === viewedPlayerId) ?? currentPlayer

  if (!currentPlayer || !displayPlayer) return null
  const infirmaryWorkerCount = state.enableFarmersOfTheMoor
    ? state.actionSpaces
      .find((space) => space.id === 'moor-infirmary')
      ?.takenBy.filter((worker) => worker.playerId === displayPlayer.id).length ?? 0
    : undefined

  return (
    <div className="player-farm-panel">
      <FarmBoard
        {...rest}
        players={state.players}
        currentPlayer={currentPlayer}
        displayPlayer={displayPlayer}
        infirmaryWorkerCount={infirmaryWorkerCount}
        playerPanelSummary={getPlayerPanelSupplySummary(state, displayPlayer)}
      />
      {/* occupations CardCarousel — added in Task 6 */}
      {/* minor improvements CardCarousel — added in Task 6 */}
    </div>
  )
}
