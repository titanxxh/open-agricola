import { describe, expect, it } from 'vitest'
import { buildEnvelope } from '../envelope-builder.ts'
import { GameSession } from '../../game/authoritative-session.ts'

describe('buildEnvelope', () => {
  const publicEventCancellations = [{
    reason: 'undoStep' as const,
    previousMaxSeq: 12,
    nextMaxSeq: 10,
    canceledEventIds: ['event-11', 'event-12'],
    canceledSeqs: [11, 12],
  }]

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
      publicEventCancellations,
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
    expect(target.payload.publicEventCancellations).toEqual(publicEventCancellations)
    expect(other.payload.publicEventCancellations).toEqual(publicEventCancellations)
    expect(observer.payload.publicEventCancellations).toEqual(publicEventCancellations)
  })

  it('filters response private events for each viewer', () => {
    const session = new GameSession()
    const resp = session.withCtx(() => session.getState())
    const p0 = resp.state.players[0]!
    const p1 = resp.state.players[1]!
    const eventResp = {
      ...resp,
      privateEvents: [
        {
          schemaVersion: 1 as const,
          type: 'private.handChanged' as const,
          recipientPlayerId: p0.id,
          cardIds: ['A116_WoodCutter'],
          cardType: 'occupation' as const,
          reason: 'dev-draw-card' as const,
        },
        {
          schemaVersion: 1 as const,
          type: 'private.handChanged' as const,
          recipientPlayerId: p1.id,
          cardIds: ['B116_Shoreforester'],
          cardType: 'occupation' as const,
          reason: 'dev-draw-card' as const,
        },
      ],
    }

    const p0Env = buildEnvelope({
      room: { id: 'r1', session },
      resp: eventResp,
      viewerPlayerId: p0.id,
      version: 1,
      cause: 'dev',
      emittedAt: 0,
    })
    const p1Env = buildEnvelope({
      room: { id: 'r1', session },
      resp: eventResp,
      viewerPlayerId: p1.id,
      version: 1,
      cause: 'dev',
      emittedAt: 0,
    })
    const observer = buildEnvelope({
      room: { id: 'r1', session },
      resp: eventResp,
      viewerPlayerId: null,
      version: 1,
      cause: 'dev',
      emittedAt: 0,
    })

    expect(p0Env.payload.privateEvents).toEqual([
      expect.objectContaining({ recipientPlayerId: p0.id, cardIds: ['A116_WoodCutter'] }),
    ])
    expect(p1Env.payload.privateEvents).toEqual([
      expect.objectContaining({ recipientPlayerId: p1.id, cardIds: ['B116_Shoreforester'] }),
    ])
    expect(observer.payload.privateEvents ?? []).toEqual([])
  })

  it('masks draft pending picks for player and null-viewer envelopes', () => {
    const session = new GameSession(12345, undefined, {
      playerCount: 2,
      draftMode: 'simultaneous',
      draftPoolSize: 7,
    })
    const resp = session.withCtx(() => session.getState())
    const p1Pick = {
      occ: resp.state.draft!.pools.p1!.occ[0]!,
      minor: resp.state.draft!.pools.p1!.minor[0]!,
    }
    resp.state.draft!.pendingPicks.p1 = {
      ...p1Pick,
    }
    resp.state.draft!.pendingPicks.p2 = {
      occ: resp.state.draft!.pools.p2!.occ[0]!,
      minor: resp.state.draft!.pools.p2!.minor[0]!,
    }

    const p1 = buildEnvelope({
      room: { id: 'r1', session },
      resp,
      viewerPlayerId: 'p1',
      version: 1,
      cause: 'reconnect',
      emittedAt: 0,
    })
    const observer = buildEnvelope({
      room: { id: 'r1', session },
      resp,
      viewerPlayerId: null,
      version: 1,
      cause: 'reconnect',
      emittedAt: 0,
    })

    expect(p1.payload.state.draft!.pendingPicks.p1).toEqual(p1Pick)
    expect(p1.payload.state.draft!.pendingPicks.p2).toEqual({ occ: '?', minor: '?' })
    expect(observer.payload.state.draft!.pendingPicks.p1).toEqual({ occ: '?', minor: '?' })
    expect(observer.payload.state.draft!.pendingPicks.p2).toEqual({ occ: '?', minor: '?' })
  })
})
