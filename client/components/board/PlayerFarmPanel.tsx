import type { ClientGameState } from '../../services/rehydrate'
import {
  FarmBoard,
  type FarmBoardActions,
  type FarmBoardView,
} from './FarmBoard'

export interface PlayerFarmPanelProps {
  state: ClientGameState
  viewedPlayerId: string
  view: Omit<
    FarmBoardView,
    'players' | 'currentPlayer' | 'displayPlayer' | 'infirmaryWorkerCount' | 'playerPanelSummary'
  >
  actions: FarmBoardActions
  inlineCardStats?: boolean
}

export function PlayerFarmPanel({
  state,
  viewedPlayerId,
  view,
  actions,
  inlineCardStats,
}: PlayerFarmPanelProps) {
  const currentPlayer = state.players[state.currentPlayerIndex]
  const displayPlayer =
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
          playerPanelSummary: displayPlayer.playerPanelSummary,
        }}
        actions={actions}
        inlineCardStats={inlineCardStats}
      />
      {/* occupations CardCarousel — added in Task 6 */}
      {/* minor improvements CardCarousel — added in Task 6 */}
    </div>
  )
}
