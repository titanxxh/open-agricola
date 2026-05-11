import { queueFutureMeeples, futureMeeplesNode } from '../../actions/effects/internal/future-meeples'
import type { ActionFlow } from '../../contract/types'
import type { CardImpl } from '../registry'
import { E41_MuddyWaters } from '../../cards-display/E/E41_MuddyWaters'

const CARD_ID = E41_MuddyWaters.id

export const E41_MuddyWaters_impl = {
  prerequisiteCheck: (player) => {
    const total =
      player.occupationPlayed.length
      + player.minorPlayed.length
      + player.improvements.length
    return total >= 5
  },
  effect: {
  id: CARD_ID,
  onBuy: (state, player) => {
    const currentRound = state.round
    let foodRounds: number[]
    let clayRounds: number[]

    if (currentRound % 2 === 0) {
      // played on even round: food on +2,+6,+10 (even+2); clay on +4,+8,+12
      foodRounds = [currentRound + 2, currentRound + 6, currentRound + 10].filter((r) => r <= 14 && r > currentRound)
      clayRounds = [currentRound + 4, currentRound + 8, currentRound + 12].filter((r) => r <= 14 && r > currentRound)
    } else {
      // played on odd round: food on +1,+5,+9,+13; clay on +3,+7,+11
      foodRounds = [currentRound + 1, currentRound + 5, currentRound + 9, currentRound + 13].filter((r) => r <= 14 && r > currentRound)
      clayRounds = [currentRound + 3, currentRound + 7, currentRound + 11].filter((r) => r <= 14 && r > currentRound)
    }

    const children: ActionFlow[] = []
    if (foodRounds.length > 0) {
      queueFutureMeeples(state, {
        cardId: CARD_ID,
        playerId: player.id,
        entries: foodRounds.map((round) => ({ round, resources: { food: 1 } })),
      })
      children.push(futureMeeplesNode())
    }
    if (clayRounds.length > 0) {
      queueFutureMeeples(state, {
        cardId: CARD_ID,
        playerId: player.id,
        entries: clayRounds.map((round) => ({ round, resources: { clay: 1 } })),
      })
      children.push(futureMeeplesNode())
    }

    if (children.length === 0) return
    if (children.length === 1) return children[0]
    return { type: 'seq' as const, children }
  },
},
  reaches: [] as readonly string[],
} satisfies CardImpl
