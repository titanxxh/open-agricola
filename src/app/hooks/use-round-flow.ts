import type { GameState, PlayerState } from '../../game/types'
import { applyFutureMeeples, applyRoundGrowth, createRoundSnapshot } from '../../logic/state'
import { applyMajorEffectsToAllPlayers } from '../../actions/cards/major'

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
