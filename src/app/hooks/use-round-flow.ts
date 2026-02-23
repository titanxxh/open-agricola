import type { GameState, PlayerState } from '../../../shared/game/types'
import { applyFutureMeeples, applyRoundGrowth, createRoundSnapshot } from '../../../shared/logic/state'
import { applyMajorEffectsToAllPlayers } from '../../../shared/actions/cards/major'

export const applyReturnHomePhase = (nextState: GameState) => {
  nextState.players.forEach((player) => {
    player.workersAvailable = player.familySize
  })
  nextState.actionSpaces.forEach((space) => {
    space.takenBy = null
  })
}

export const finalizeRoundCore = (nextState: GameState) => {
  nextState.players.forEach((player) => {
    player.newbornCount = 0
  })
  nextState.round += 1
  if (nextState.round > 14) {
    nextState.gameOver = true
    nextState.log.unshift({ key: 'log.gameOver' })
    return { type: 'gameOver' as const, nextState }
  }
  applyRoundGrowth(nextState)
  applyFutureMeeples(nextState)
  applyMajorEffectsToAllPlayers(nextState, 'onRoundStart')
  const startIndex = nextState.players.findIndex((p) => p.startPlayer)
  nextState.currentPlayerIndex = startIndex === -1 ? 0 : startIndex
  nextState.log.unshift({
    key: 'log.enterRound',
    params: { round: nextState.round },
  })
  nextState.roundStartSnapshot = createRoundSnapshot(nextState)
  return { type: 'nextRound' as const, nextState }
}

export const nextPlayerIndex = (players: PlayerState[], startIndex: number) => {
  const total = players.length
  for (let offset = 1; offset <= total; offset += 1) {
    const candidate = (startIndex + offset) % total
    const player = players[candidate]
    if (player && player.workersAvailable > 0) {
      return candidate
    }
  }
  return startIndex
}

export const canPerformRoundEnd = (params: {
  state: GameState
  allWorkersUsed: boolean
  pendingNextPlayerIndex: number | null
  hasPendingChoice: boolean
  hasPendingAnimalReorg: boolean
  hasPendingHarvestFeed: boolean
}) => {
  const {
    state,
    allWorkersUsed,
    pendingNextPlayerIndex,
    hasPendingChoice,
    hasPendingAnimalReorg,
    hasPendingHarvestFeed,
  } = params
  if (state.gameOver) return false
  if (!allWorkersUsed) return false
  if (pendingNextPlayerIndex !== null) return false
  if (hasPendingChoice || hasPendingAnimalReorg) return false
  if (hasPendingHarvestFeed) return false
  return true
}

export const prepareRoundEndCore = (params: {
  baseState: GameState
  hasPendingAnimals: (player: PlayerState) => boolean
  cloneState: (state: GameState) => GameState
  harvestRounds: number[]
}) => {
  const { baseState, hasPendingAnimals, cloneState, harvestRounds } = params
  const pendingPlayerIndex = baseState.players.findIndex((player) =>
    hasPendingAnimals(player),
  )
  if (pendingPlayerIndex !== -1) {
    return { type: 'pendingAnimals' as const, pendingPlayerIndex }
  }
  const nextState = cloneState(baseState)
  applyReturnHomePhase(nextState)
  if (harvestRounds.includes(baseState.round)) {
    return { type: 'startHarvest' as const, nextState }
  }
  return { type: 'finalizeRound' as const, nextState }
}
