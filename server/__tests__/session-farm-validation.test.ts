import { afterEach, describe, expect, it } from 'vitest'
import { getActiveCardRegistry, setActiveCardRegistry } from '../../shared/cards/active-registry'
import { CardRegistry } from '../../shared/cards/registry'
import { serializeSessionSnapshot } from '../../shared/session/serialization'
import type { GameSession } from '../game/authoritative-session'
import { createWorkSession } from './_helpers/session-fixtures'

const sessions: GameSession[] = []
const keep = (session: GameSession) => { sessions.push(session); return session }
const snapshot = (session: GameSession) => JSON.stringify({
  response: session.getState(),
  persisted: serializeSessionSnapshot(session.state, session),
})

afterEach(() => { sessions.splice(0).forEach(session => session.dispose()) })

describe('Session farm-choice validation', () => {
  it('uses session rules without borrowing an ambient registry or changing either session', () => {
    const locked = keep(createWorkSession({ configure: state => {
      state.players[0]!.minorPlayed = ['B038_FutureBuildingSite']
      state.players[0]!.cardStates.B038_FutureBuildingSite = {
        extraData: { locked: [{ row: 0, col: 0 }] },
      }
    } }))
    const ordinary = keep(createWorkSession())
    const before = [snapshot(locked), snapshot(ordinary)]
    const previous = getActiveCardRegistry()
    try {
      for (const ambient of [null, new CardRegistry()]) {
        setActiveCardRegistry(ambient)
        expect(locked.validateFarmChoice('plow', 'p1', { tile: { row: 0, col: 0 } }))
          .toEqual({ valid: false, error: 'LOCKED' })
        expect(ordinary.validateFarmChoice('plow', 'p1', { tile: { row: 0, col: 0 } }))
          .toEqual({ valid: true, error: null })
        expect(locked.validateFarmChoice('plow', 'p1', { tile: { row: 0, col: 1 } }))
          .toEqual({ valid: true, error: null })
        expect(getActiveCardRegistry()).toBe(ambient)
      }
      expect([snapshot(locked), snapshot(ordinary)]).toEqual(before)
    } finally {
      setActiveCardRegistry(previous)
    }
  })
})
