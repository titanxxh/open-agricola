/**
 * HTTP privacy & seat-binding tests.
 *
 * Policy (see `server/game-router.ts`):
 *   - HTTP is per-user sandbox — one caller plays every seat by default.
 *   - Callers opt into per-viewer filtering via the `X-Viewer-Player: <playerId>`
 *     header.
 *   - When set, the response state is filtered through `serializeStateForPlayer`
 *     and every endpoint that accepts `body.playerIndex` (or `body.playerId`
 *     for draft-submit) is seat-bound to that viewer (403 on mismatch).
 *   - When absent, HTTP behaves exactly as before (no filter, no guard).
 */
import { describe, it, expect, beforeEach } from 'vitest'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { handleGameRoute, setSession } from '../game-router.ts'
import { GameSession } from '../game/authoritative-session.ts'

type MockRes = ServerResponse & { statusCode: number; body: string }

const mockReq = (
  method: string,
  url: string,
  body: unknown = null,
  headers: Record<string, string> = {},
): IncomingMessage => {
  const bodyStr = body ? JSON.stringify(body) : ''
  let dataEmitted = false
  const req = {
    method,
    url,
    headers,
    on(event: string, cb: (chunk?: Buffer) => void) {
      if (event === 'data' && bodyStr && !dataEmitted) {
        dataEmitted = true
        cb(Buffer.from(bodyStr))
      }
      if (event === 'end') cb()
      return req
    },
  } as unknown as IncomingMessage
  return req
}

const mockRes = (): MockRes => {
  let statusCode = 200
  let body = ''
  return {
    get statusCode() { return statusCode },
    set statusCode(v) { statusCode = v },
    get body() { return body },
    writeHead(code: number) { statusCode = code },
    end(data?: string) { body = data ?? '' },
  } as unknown as MockRes
}

describe('HTTP privacy + seat binding', () => {
  beforeEach(() => {
    // Fresh session per test — default map key is 'anonymous' (no auth header).
    setSession(new GameSession(12345))
  })

  describe('viewer-less (default) — unfiltered, no seat guard', () => {
    it('GET /api/game/state returns every player hand as real strings', async () => {
      const req = mockReq('GET', '/api/game/state')
      const res = mockRes()
      await handleGameRoute(req, res)
      expect(res.statusCode).toBe(200)
      const data = JSON.parse(res.body)
      expect(Array.isArray(data.state.players)).toBe(true)
      for (const p of data.state.players) {
        expect(p.occupationHand.length).toBeGreaterThan(0)
        expect(p.minorHand.length).toBeGreaterThan(0)
        expect(p.occupationHand.every((c: string) => c !== '?')).toBe(true)
        expect(p.minorHand.every((c: string) => c !== '?')).toBe(true)
      }
    })

    it('accepts any playerIndex without seat guard (multi-seat dev flow)', async () => {
      // p1 takes the first free space
      const state0Res = mockRes()
      await handleGameRoute(mockReq('GET', '/api/game/state'), state0Res)
      const state0 = JSON.parse(state0Res.body)
      const freeSpace = state0.state.actionSpaces.find(
        (s: { takenBy: unknown[] }) => s.takenBy.length === 0,
      )
      expect(freeSpace).toBeTruthy()

      const req = mockReq('POST', '/api/game/action', {
        playerIndex: 0,
        spaceId: freeSpace.id,
      })
      const res = mockRes()
      await handleGameRoute(req, res)
      // Should succeed (200) or fail with a rule error (400) — but NOT 403.
      expect(res.statusCode).not.toBe(403)
    })
  })

  describe('viewer set via X-Viewer-Player header — filtered + seat-bound', () => {
    it('filters opponent hands to same-length ? arrays for viewer=p1', async () => {
      const req = mockReq('GET', '/api/game/state', null, { 'x-viewer-player': 'p1' })
      const res = mockRes()
      await handleGameRoute(req, res)
      expect(res.statusCode).toBe(200)
      const data = JSON.parse(res.body)
      const [p1, p2] = data.state.players
      expect(p1.id).toBe('p1')
      expect(p2.id).toBe('p2')
      // p1 sees own hand
      expect(p1.occupationHand.every((c: string) => c !== '?')).toBe(true)
      expect(p1.minorHand.every((c: string) => c !== '?')).toBe(true)
      // p2 hand is masked
      expect(p2.occupationHand.length).toBeGreaterThan(0)
      expect(p2.occupationHand.every((c: string) => c === '?')).toBe(true)
      expect(p2.minorHand.every((c: string) => c === '?')).toBe(true)
    })

    it('filters opponent hands for viewer=p2 (perspective swap)', async () => {
      const req = mockReq('GET', '/api/game/state', null, { 'x-viewer-player': 'p2' })
      const res = mockRes()
      await handleGameRoute(req, res)
      expect(res.statusCode).toBe(200)
      const data = JSON.parse(res.body)
      const [p1, p2] = data.state.players
      // p2 sees own hand
      expect(p2.occupationHand.every((c: string) => c !== '?')).toBe(true)
      // p1 hand is masked
      expect(p1.occupationHand.every((c: string) => c === '?')).toBe(true)
    })

    it('unknown viewer id falls back to unfiltered (defensive)', async () => {
      const req = mockReq('GET', '/api/game/state', null, { 'x-viewer-player': 'pUnknown' })
      const res = mockRes()
      await handleGameRoute(req, res)
      const data = JSON.parse(res.body)
      for (const p of data.state.players) {
        expect(p.occupationHand.every((c: string) => c !== '?')).toBe(true)
      }
    })

    it('returns 403 when playerIndex does not match viewer seat', async () => {
      // viewer=p1 but acting as playerIndex=1 (p2) → must reject
      const state0Res = mockRes()
      await handleGameRoute(mockReq('GET', '/api/game/state'), state0Res)
      const state0 = JSON.parse(state0Res.body)
      const freeSpace = state0.state.actionSpaces.find(
        (s: { takenBy: unknown[] }) => s.takenBy.length === 0,
      )

      const req = mockReq(
        'POST',
        '/api/game/action',
        { playerIndex: 1, spaceId: freeSpace.id },
        { 'x-viewer-player': 'p1' },
      )
      const res = mockRes()
      await handleGameRoute(req, res)
      expect(res.statusCode).toBe(403)
      const data = JSON.parse(res.body)
      expect(data.ok).toBe(false)
      expect(data.error).toBe('seat mismatch')
    })

    it('allows the action when playerIndex matches viewer seat', async () => {
      const state0Res = mockRes()
      await handleGameRoute(mockReq('GET', '/api/game/state'), state0Res)
      const state0 = JSON.parse(state0Res.body)
      const freeSpace = state0.state.actionSpaces.find(
        (s: { takenBy: unknown[] }) => s.takenBy.length === 0,
      )

      const req = mockReq(
        'POST',
        '/api/game/action',
        { playerIndex: 0, spaceId: freeSpace.id },
        { 'x-viewer-player': 'p1' },
      )
      const res = mockRes()
      await handleGameRoute(req, res)
      expect(res.statusCode).not.toBe(403)
    })

    it('draft-submit: 403 when playerId does not match viewer', async () => {
      const req = mockReq(
        'POST',
        '/api/game/draft-submit',
        { playerId: 'p2', pick: { occCardId: 'X', minorCardId: 'Y' } },
        { 'x-viewer-player': 'p1' },
      )
      const res = mockRes()
      await handleGameRoute(req, res)
      expect(res.statusCode).toBe(403)
      const data = JSON.parse(res.body)
      expect(data.error).toBe('seat mismatch')
    })
  })

  describe('filtered response shape', () => {
    it('preserves pending/scores/ok fields when filtering state', async () => {
      const req = mockReq('GET', '/api/game/state', null, { 'x-viewer-player': 'p1' })
      const res = mockRes()
      await handleGameRoute(req, res)
      const data = JSON.parse(res.body)
      expect(data).toHaveProperty('ok')
      expect(data).toHaveProperty('state')
      expect(data).toHaveProperty('scores')
      expect(data).toHaveProperty('pending')
    })

    it('masked hand length matches the unfiltered length', async () => {
      const plain = mockRes()
      await handleGameRoute(mockReq('GET', '/api/game/state'), plain)
      const plainData = JSON.parse(plain.body)

      const filtered = mockRes()
      await handleGameRoute(
        mockReq('GET', '/api/game/state', null, { 'x-viewer-player': 'p1' }),
        filtered,
      )
      const filteredData = JSON.parse(filtered.body)

      expect(filteredData.state.players[1].occupationHand.length).toBe(
        plainData.state.players[1].occupationHand.length,
      )
      expect(filteredData.state.players[1].minorHand.length).toBe(
        plainData.state.players[1].minorHand.length,
      )
    })
  })
})
