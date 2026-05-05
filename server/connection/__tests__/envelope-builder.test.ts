import { describe, expect, it } from 'vitest'
import { buildEnvelope } from '../envelope-builder.ts'
import { GameSession } from '../../game/authoritative-session.ts'

describe('buildEnvelope', () => {
  it('emits a stateUpdate envelope with the given metadata', () => {
    const session = new GameSession()
    const resp = session.withCtx(() => session.getState())
    const env = buildEnvelope({
      room: { id: 'r1', session },
      resp,
      viewerPlayerId: null,
      version: 7,
      cause: 'action',
      requestId: 'req-1',
      emittedAt: 12345,
    })
    expect(env.type).toBe('stateUpdate')
    expect(env.roomId).toBe('r1')
    expect(env.version).toBe(7)
    expect(env.cause).toBe('action')
    expect(env.requestId).toBe('req-1')
    expect(env.sync).toBe('snapshot')
    expect(env.emittedAt).toBe(12345)
    expect(env.payload.state).toBeDefined()
    expect((env.payload.state as { engineStack?: unknown }).engineStack).toBeDefined()
  })

  it('redacts state for the given viewer id', () => {
    const session = new GameSession()
    const resp = session.withCtx(() => session.getState())
    const player0Id = resp.state.players[0]!.id
    const env = buildEnvelope({
      room: { id: 'r1', session },
      resp,
      viewerPlayerId: player0Id,
      version: 1,
      cause: 'action',
      emittedAt: 0,
    })
    const players = (env.payload.state as { players: Array<{ id: string }> }).players
    expect(players[0]!.id).toBe(player0Id)
    expect(players[1]!.id).not.toBe(player0Id)
  })
})
