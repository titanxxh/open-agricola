import type { GameState, PlayerState } from '../../../shared/contract/types'
import { getPlayerPanelSupplySummary } from '../../../shared/domain/player-panel-summary'
import {
  FarmBoard,
  type FarmBoardActions,
  type FarmBoardView,
} from './FarmBoard'

export interface PlayerFarmPanelProps {
  state: GameState
  viewedPlayerId: string
  view: Omit<
    FarmBoardView,
    'players' | 'currentPlayer' | 'displayPlayer' | 'infirmaryWorkerCount' | 'playerPanelSummary'
  >
  actions: FarmBoardActions
}

export function PlayerFarmPanel({
  state,
  viewedPlayerId,
  view,
  actions,
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
        view={{
          ...view,
          players: state.players,
          currentPlayer,
          displayPlayer,
          infirmaryWorkerCount,
          playerPanelSummary: getPlayerPanelSupplySummary(state, displayPlayer),
        }}
        actions={actions}
      />
      {/* occupations CardCarousel — added in Task 6 */}
      {/* minor improvements CardCarousel — added in Task 6 */}
    </div>
  )
}
