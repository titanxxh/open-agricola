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

import '../../shared/cards/E/E78_SleightofHand'

const E78_CARD_ID = 'E78_SleightofHand'

type MockRes = ServerResponse & { statusCode: number; body: string }

const maxEventSeq = (events: Array<{ seq: number }>): number =>
  events.reduce((max, event) => Math.max(max, event.seq), 0)

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

const setupE78BatchPromptSession = () => {
  const session = new GameSession()
  const state = session.getState().state
  state.players = state.players.slice(0, 2)
  state.currentPlayerIndex = 0
  const player = state.players[0]!
  player.minorHand = [E78_CARD_ID]
  player.occupationPlayed = ['occ-1', 'occ-2', 'occ-3']
  player.resources.wood = 2
  player.resources.clay = 1
  state.players[1]!.minorHand = ['__test_placeholder__']
  state.players[1]!.occupationHand = ['__test_placeholder__']
  session.loadState(state)

  let resp = session.takeAction(0, 'meeting-place')
  for (let safety = 0; safety < 20; safety += 1) {
    expect(resp.ok).toBe(true)
    if (
      resp.interaction.stateId === 'wait' &&
      resp.interaction.request.kind === 'resource-batch-exchange-select'
    ) {
      setSession(session)
      return session
    }
    if (resp.interaction.stateId !== 'wait') break
    const next = resp.interaction.options?.find((option) => option.value !== '__skip__' && option.value !== 'cancel')
    if (!next) break
    resp = session.resolveChoice(resp.interaction.playerIndex, next.value)
  }
  throw new Error('resource batch prompt not reached')
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

    it.each([
      [{ cancel: true, unknown: 1 }],
      [{ cancel: false }],
      [{ positions: [{ row: 0, col: '0' }] }],
      [{ crops: [{ row: 0, col: 0, crop: 'reed' }] }],
      [{ resourceCounts: null }],
    ])('rejects invalid commit-selection payload %j', async (payload) => {
      const req = mockReq('POST', '/api/game/commit-selection', {
        playerIndex: 0,
        payload,
      })
      const res = mockRes()
      await handleGameRoute(req, res)
      expect(res.statusCode).toBe(400)
      expect(JSON.parse(res.body).error).toBe('invalid payload')
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

    it('draft-submit returns private draftUpdated only for the matching viewer', async () => {
      const session = new GameSession(12345, undefined, {
        playerCount: 2,
        draftMode: 'simultaneous',
        draftPoolSize: 7,
      })
      const initial = session.getState().state
      const pick = {
        occCardId: initial.draft!.pools.p1.occ[0]!,
        minorCardId: initial.draft!.pools.p1.minor[0]!,
      }
      setSession(session)

      const submitRes = mockRes()
      await handleGameRoute(
        mockReq(
          'POST',
          '/api/game/draft-submit',
          { playerId: 'p1', pick },
          { 'x-viewer-player': 'p1' },
        ),
        submitRes,
      )

      expect(submitRes.statusCode).toBe(200)
      const submitData = JSON.parse(submitRes.body)
      expect(submitData.privateEvents).toEqual([
        {
          schemaVersion: 1,
          type: 'private.draftUpdated',
          recipientPlayerId: 'p1',
          round: 1,
          totalRounds: 7,
          picked: pick,
          poolCounts: { occ: 7, minor: 7 },
          keptCounts: { occ: 0, minor: 0 },
          advanced: false,
          finished: false,
        },
      ])

      const p2StateRes = mockRes()
      await handleGameRoute(
        mockReq('GET', '/api/game/state', null, { 'x-viewer-player': 'p2' }),
        p2StateRes,
      )
      const p2StateData = JSON.parse(p2StateRes.body)
      expect(p2StateData.privateEvents ?? []).toEqual([])
      expect(p2StateData.state.draft.pendingPicks.p1).toEqual({ occ: '?', minor: '?' })
    })

    it('submitDraftPick error response does not include privateEvents', () => {
      const session = new GameSession(12345, undefined, {
        playerCount: 2,
        draftMode: 'simultaneous',
        draftPoolSize: 7,
      })

      const resp = session.submitDraftPick('p1', {
        occCardId: 'not-in-pool',
        minorCardId: 'also-not-in-pool',
      })

      expect(resp.ok).toBe(false)
      expect(resp.privateEvents).toBeUndefined()
    })

    it('draft final submitter receives own draft-finalized handChanged over HTTP', async () => {
      const session = new GameSession(12345, undefined, {
        playerCount: 2,
        draftMode: 'simultaneous',
        draftPoolSize: 7,
      })
      setSession(session)
      let finalSubmitData: ReturnType<typeof JSON.parse> | null = null

      for (let round = 1; round <= 7; round += 1) {
        const p2State = session.getState().state
        const p2Pick = {
          occCardId: p2State.draft!.pools.p2.occ[0]!,
          minorCardId: p2State.draft!.pools.p2.minor[0]!,
        }
        const p2Res = mockRes()
        await handleGameRoute(
          mockReq(
            'POST',
            '/api/game/draft-submit',
            { playerId: 'p2', pick: p2Pick },
            { 'x-viewer-player': 'p2' },
          ),
          p2Res,
        )
        expect(p2Res.statusCode).toBe(200)

        const p1State = session.getState().state
        const p1Pick = {
          occCardId: p1State.draft!.pools.p1.occ[0]!,
          minorCardId: p1State.draft!.pools.p1.minor[0]!,
        }
        const p1Res = mockRes()
        await handleGameRoute(
          mockReq(
            'POST',
            '/api/game/draft-submit',
            { playerId: 'p1', pick: p1Pick },
            { 'x-viewer-player': 'p1' },
          ),
          p1Res,
        )
        expect(p1Res.statusCode).toBe(200)
        if (round === 7) finalSubmitData = JSON.parse(p1Res.body)
      }

      expect(finalSubmitData).not.toBeNull()
      const p1 = finalSubmitData!.state.players[0]
      const p1FinalCardIds = p1.occupationHand.concat(p1.minorHand)
      expect(finalSubmitData!.privateEvents).toEqual([
        expect.objectContaining({
          type: 'private.draftUpdated',
          recipientPlayerId: 'p1',
          advanced: true,
          finished: true,
        }),
        expect.objectContaining({
          type: 'private.handChanged',
          recipientPlayerId: 'p1',
          cardIds: p1FinalCardIds,
          cardType: 'mixed',
          reason: 'draft-finalized',
        }),
      ])
      expect(finalSubmitData!.privateEvents).not.toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            type: 'private.handChanged',
            recipientPlayerId: 'p2',
          }),
        ]),
      )
    })

    it('dev draw-card returns a private handChanged event for the matching viewer', async () => {
      const res = mockRes()
      await handleGameRoute(
        mockReq(
          'POST',
          '/api/game/dev/draw-card',
          { playerIndex: 0, cardId: 'A116_WoodCutter' },
          { 'x-viewer-player': 'p1' },
        ),
        res,
      )

      expect(res.statusCode).toBe(200)
      const data = JSON.parse(res.body)
      expect(data.privateEvents).toEqual([
        {
          schemaVersion: 1,
          type: 'private.handChanged',
          recipientPlayerId: 'p1',
          cardIds: ['A116_WoodCutter'],
          cardType: 'occupation',
          reason: 'dev-draw-card',
        },
      ])
    })

    it('dev draw-card returns 403 when playerIndex does not match viewer', async () => {
      const res = mockRes()
      await handleGameRoute(
        mockReq(
          'POST',
          '/api/game/dev/draw-card',
          { playerIndex: 0, cardId: 'A116_WoodCutter' },
          { 'x-viewer-player': 'p2' },
        ),
        res,
      )

      expect(res.statusCode).toBe(403)
      const data = JSON.parse(res.body)
      expect(data.ok).toBe(false)
      expect(data.error).toBe('seat mismatch')
    })

    it('GET /api/game/state filters E78 private batch prompt per viewer', async () => {
      setupE78BatchPromptSession()

      const targetRes = mockRes()
      await handleGameRoute(
        mockReq('GET', '/api/game/state', null, { 'x-viewer-player': 'p1' }),
        targetRes,
      )
      expect(targetRes.statusCode).toBe(200)
      const targetData = JSON.parse(targetRes.body)
      expect(targetData.interaction.stateId).toBe('wait')
      expect(targetData.interaction.request.kind).toBe('resource-batch-exchange-select')
      expect(targetData.privateEvents).toEqual([
        expect.objectContaining({
          type: 'private.promptShown',
          recipientPlayerId: 'p1',
          promptKind: 'resource-batch-exchange-select',
          sourceCard: E78_CARD_ID,
        }),
      ])

      const otherRes = mockRes()
      await handleGameRoute(
        mockReq('GET', '/api/game/state', null, { 'x-viewer-player': 'p2' }),
        otherRes,
      )
      expect(otherRes.statusCode).toBe(200)
      const otherData = JSON.parse(otherRes.body)
      expect(otherData.interaction.stateId).toBe('wait')
      expect(otherData.interaction.request.kind).toBe('private-prompt')
      expect(otherData.privateEvents ?? []).toEqual([])

      const observerRes = mockRes()
      await handleGameRoute(mockReq('GET', '/api/game/state'), observerRes)
      expect(observerRes.statusCode).toBe(200)
      const observerData = JSON.parse(observerRes.body)
      expect(observerData.interaction.stateId).toBe('wait')
      expect(observerData.interaction.request.kind).toBe('resource-batch-exchange-select')
      expect(observerData.privateEvents ?? []).toEqual([])
    })

    it('POST /api/game/undo-action returns public event cancellations with viewer filtering', async () => {
      setupE78BatchPromptSession()

      const commitRes = mockRes()
      await handleGameRoute(
        mockReq(
          'POST',
          '/api/game/commit-selection',
          {
            playerIndex: 0,
            payload: {
              resourceBatchExchange: {
                discard: { wood: 2, clay: 1 },
                receive: { wood: 1, stone: 2 },
              },
            },
          },
          { 'x-viewer-player': 'p1' },
        ),
        commitRes,
      )
      expect(commitRes.statusCode).toBe(200)
      const commitData = JSON.parse(commitRes.body)
      const exchangedEvent = commitData.state.events.find((event: {
        type: string
        sourceCardId?: string
      }) => event.type === 'resource.exchanged' && event.sourceCardId === E78_CARD_ID)
      expect(exchangedEvent).toBeDefined()
      const previousMaxSeq = maxEventSeq(commitData.state.events)

      const undoRes = mockRes()
      await handleGameRoute(
        mockReq(
          'POST',
          '/api/game/undo-action',
          null,
          { 'x-viewer-player': 'p1' },
        ),
        undoRes,
      )
      expect(undoRes.statusCode).toBe(200)
      const undoData = JSON.parse(undoRes.body)
      expect(undoData.publicEventCancellations).toEqual([
        expect.objectContaining({
          reason: 'undoAction',
          previousMaxSeq,
          canceledEventIds: expect.arrayContaining([exchangedEvent.id]),
          canceledSeqs: expect.arrayContaining([exchangedEvent.seq]),
        }),
      ])
      expect(undoData.privateEvents ?? []).toEqual([])
    })

    it('GET /api/game/state filters response privateEvents per viewer', async () => {
      const session = new GameSession(12345)
      const originalGetState = session.getState.bind(session)
      session.getState = () => {
        const resp = originalGetState()
        return {
          ...resp,
          privateEvents: [
            {
              schemaVersion: 1 as const,
              type: 'private.handChanged' as const,
              recipientPlayerId: 'p1',
              cardIds: ['A116_WoodCutter'],
              cardType: 'occupation' as const,
              reason: 'dev-draw-card' as const,
            },
            {
              schemaVersion: 1 as const,
              type: 'private.handChanged' as const,
              recipientPlayerId: 'p2',
              cardIds: ['B116_Shoreforester'],
              cardType: 'occupation' as const,
              reason: 'dev-draw-card' as const,
            },
          ],
        }
      }
      setSession(session)

      const p1Res = mockRes()
      await handleGameRoute(
        mockReq('GET', '/api/game/state', null, { 'x-viewer-player': 'p1' }),
        p1Res,
      )
      expect(JSON.parse(p1Res.body).privateEvents).toEqual([
        expect.objectContaining({ recipientPlayerId: 'p1', cardIds: ['A116_WoodCutter'] }),
      ])

      const p2Res = mockRes()
      await handleGameRoute(
        mockReq('GET', '/api/game/state', null, { 'x-viewer-player': 'p2' }),
        p2Res,
      )
      expect(JSON.parse(p2Res.body).privateEvents).toEqual([
        expect.objectContaining({ recipientPlayerId: 'p2', cardIds: ['B116_Shoreforester'] }),
      ])

      const observerRes = mockRes()
      await handleGameRoute(mockReq('GET', '/api/game/state'), observerRes)
      expect(JSON.parse(observerRes.body).privateEvents ?? []).toEqual([])
    })
  })

  describe('filtered response shape', () => {
    it('preserves interaction/scores/ok fields when filtering state', async () => {
      const req = mockReq('GET', '/api/game/state', null, { 'x-viewer-player': 'p1' })
      const res = mockRes()
      await handleGameRoute(req, res)
      const data = JSON.parse(res.body)
      expect(data).toHaveProperty('ok')
      expect(data).toHaveProperty('state')
      expect(data).toHaveProperty('scores')
      expect(data).toHaveProperty('interaction')
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
