import { createServer } from 'node:http'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { getActiveCardRegistry, setActiveCardRegistry } from '../../shared/cards/active-registry'
import { CardRegistry } from '../../shared/cards/registry'
import { serializeSessionSnapshot } from '../../shared/session/serialization'
import { handleGameRoute, setSession, shutdownSandboxSessions } from '../game-router'
import { createWorkSession } from './_helpers/session-fixtures'

afterEach(() => {
  shutdownSandboxSessions()
  vi.unstubAllEnvs()
})

describe('HTTP Session farm-choice validation', () => {
  it('keeps locked tiles and request errors correct without an ambient card environment', async () => {
    vi.stubEnv('ALLOW_ANONYMOUS_WS', 'true')
    const session = createWorkSession({ configure: state => {
      state.players[0]!.minorPlayed = ['B038_FutureBuildingSite']
      state.players[0]!.cardStates.B038_FutureBuildingSite = {
        extraData: { locked: [{ row: 0, col: 0 }] },
      }
    } })
    setSession(session)
    const other = createWorkSession()
    const capture = () => JSON.stringify([session, other].map(current => ({
      response: current.getState(),
      persisted: serializeSessionSnapshot(current.state, current),
    })))
    const before = capture()
    const server = createServer((req, res) => {
      void handleGameRoute(req, res).catch(error => {
        res.writeHead(500)
        res.end(String(error))
      })
    })
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
    const address = server.address()
    if (!address || typeof address === 'string') throw new Error('Missing HTTP test address')
    const post = async (type: string, playerId: string, payload: Record<string, unknown>) => {
      const response = await fetch(`http://127.0.0.1:${address.port}/api/game/validate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type, playerId, payload }),
      })
      return { status: response.status, body: await response.json() }
    }
    const previous = getActiveCardRegistry()
    try {
      for (const ambient of [null, new CardRegistry()]) {
        setActiveCardRegistry(ambient)
        expect(await post('plow', 'p1', { tile: { row: 0, col: 0 } })).toEqual({
          status: 200, body: { valid: false, error: 'LOCKED' },
        })
        expect(await post('plow', 'p1', { tile: { row: 0, col: 1 } })).toEqual({
          status: 200, body: { valid: true, error: null },
        })
        expect(await post('sow', 'p1', {})).toEqual({
          status: 200, body: { valid: false, error: 'NO_SELECTION' },
        })
        expect(await post('room', 'nobody', {})).toEqual({
          status: 400, body: { valid: false, error: 'Player not found' },
        })
        expect(await post('unknown', 'p1', {})).toEqual({
          status: 400, body: { valid: false, error: 'Unknown validation type' },
        })
        expect(getActiveCardRegistry()).toBe(ambient)
      }
      expect(capture()).toBe(before)
    } finally {
      setActiveCardRegistry(previous)
      other.dispose()
      await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()))
    }
  })
})
