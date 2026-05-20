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

  it('redacts private prompts and emits private events only for the target viewer', () => {
    const session = new GameSession()
    const resp = session.withCtx(() => session.getState())
    const p0 = resp.state.players[0]!
    const p1 = resp.state.players[1]!
    const waitResp = {
      ...resp,
      interaction: {
        stateId: 'wait' as const,
        playerIndex: 0,
        sourceCard: 'E78_SleightofHand',
        promptKey: 'ui.interactionSleightOfHand' as const,
        request: {
          kind: 'resource-batch-exchange-select' as const,
          cardId: 'E78_SleightofHand',
          discardAvailableByResource: { wood: 2, clay: 1 },
          receiveResources: ['wood', 'clay', 'reed', 'stone'] as const,
          maxTotal: 4,
        },
        allowedCommands: ['commitSelection', 'undoStep', 'undoAction'] as const,
        anytimeActions: [],
      },
    }

    const target = buildEnvelope({
      room: { id: 'r1', session },
      resp: waitResp,
      viewerPlayerId: p0.id,
      version: 1,
      cause: 'choice',
      emittedAt: 0,
    })
    const other = buildEnvelope({
      room: { id: 'r1', session },
      resp: waitResp,
      viewerPlayerId: p1.id,
      version: 1,
      cause: 'choice',
      emittedAt: 0,
    })
    const observer = buildEnvelope({
      room: { id: 'r1', session },
      resp: waitResp,
      viewerPlayerId: null,
      version: 1,
      cause: 'choice',
      emittedAt: 0,
    })

    expect(target.payload.interaction.stateId).toBe('wait')
    expect(target.payload.interaction.stateId === 'wait' && target.payload.interaction.request.kind)
      .toBe('resource-batch-exchange-select')
    expect(target.payload.privateEvents).toEqual([
      expect.objectContaining({
        type: 'private.promptShown',
        recipientPlayerId: p0.id,
        promptKind: 'resource-batch-exchange-select',
        sourceCard: 'E78_SleightofHand',
      }),
    ])
    expect(other.payload.privateEvents ?? []).toEqual([])
    expect(observer.payload.privateEvents ?? []).toEqual([])
    expect(other.payload.interaction.stateId === 'wait' && other.payload.interaction.request.kind)
      .toBe('private-prompt')
    expect(observer.payload.interaction.stateId === 'wait' && observer.payload.interaction.request.kind)
      .toBe('private-prompt')
  })
})
