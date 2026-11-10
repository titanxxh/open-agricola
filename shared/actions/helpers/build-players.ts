import type { GameState, PlayerState } from '../../contract/types'

type BuildPlayersContext = {
  state: GameState
  player: PlayerState
  actionContext?: Record<string, unknown>
}

export const resolveBuildPlayers = ({ state, player, actionContext }: BuildPlayersContext): {
  builder: PlayerState
  farmOwner: PlayerState
} | undefined => {
  const targetFarmPlayerId = actionContext?.targetFarmPlayerId
  if (targetFarmPlayerId === undefined || targetFarmPlayerId === player.id) {
    return { builder: player, farmOwner: player }
  }
  if (typeof targetFarmPlayerId !== 'string') return undefined
  const farmOwner = state.players.find(candidate => candidate.id === targetFarmPlayerId)
  return farmOwner ? { builder: player, farmOwner } : undefined
}
