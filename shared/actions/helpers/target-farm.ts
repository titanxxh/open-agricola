import type { GameState, PlayerState } from '../../contract/types'

type FarmContext = { state: GameState; player: PlayerState; actionContext?: Record<string, unknown> }

export const withTargetFarm = (actionContext: Record<string, unknown> | undefined, farmOwnerPlayerId: string) => ({
  ...actionContext, targetFarmPlayerId: farmOwnerPlayerId,
})

export const candidateBuildFarmPlayers = ({ state, player, actionContext }: FarmContext): PlayerState[] => {
  const locked = actionContext?.targetFarmPlayerId
  const actorIndex = state.players.findIndex(candidate => candidate.id === player.id)
  const teamIndex = state.team?.playerTeams[actorIndex]
  const candidates = !state.team?.configuration.cooperationRules || actionContext?.targetFarmPolicy === 'own' || teamIndex === undefined
    ? [player]
    : [player, ...state.players.filter((candidate, index) => candidate.id !== player.id && state.team?.playerTeams[index] === teamIndex)]
  return locked === undefined ? candidates : typeof locked === 'string' ? candidates.filter(candidate => candidate.id === locked) : []
}
