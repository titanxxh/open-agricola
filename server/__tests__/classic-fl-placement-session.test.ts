import { afterEach, describe, expect, it } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { flCard, flSession } from './_helpers/classic-fl'
import { playImprovement } from './_helpers/card-play-lifecycle'
import { familySize, workersAvailable } from '../../shared/domain/player'

const sessions: GameSession[] = []
const keep = (session: GameSession) => {
  sessions.push(session)
  return session
}
afterEach(() => sessions.splice(0).forEach((session) => session.dispose()))

describe('FL: real work-phase placement', () => {
  it('Beguine Courtyard: completes the five-room C and activates all remaining adults on purchase', () => {
    const session = keep(
      flSession((state) => {
        const p = state.players[0]!
        p.minorHand = [flCard(2).id]
        p.roomTiles = [
          { row: 0, col: 0 },
          { row: 1, col: 0 },
          { row: 2, col: 0 },
          { row: 0, col: 1 },
          { row: 2, col: 1 },
        ]
        p.rooms = 5
        Object.assign(p.resources, { clay: 2, stone: 2 })
      }),
    )
    const response = playImprovement(session, flCard(2).id, 'meeting-place')
    expect(response.ok, response.error).toBe(true)
    expect(familySize(response.state.players[0]!)).toBe(5)
    expect(workersAvailable(response.state, response.state.players[0]!)).toBe(4)
    expect(response.state.players[0]!.workers.some((worker) => worker.isNewborn)).toBe(false)
  })
})
