import { describe, expect, it } from 'vitest'
import { requireActiveCardRegistry } from '../../../shared/cards/active-registry.ts'
import { serializeState, serializeSessionSnapshot, rehydrateState } from '../../../shared/session/serialization.ts'
import { GameSession } from '../authoritative-session.ts'
import type { SessionResponse } from '../authoritative-session.ts'

describe('GameSession.buildSyncPayload', () => {
  it('uses the owning Session for display projections and preserves them in replay frames', () => {
    const first = new GameSession(9101, undefined, { playerCount: 2 })
    const second = new GameSession(9102, undefined, { playerCount: 2 })
    for (const [session, capacity] of [[first, 1], [second, 3]] as const) {
      session.state.players.forEach(player => {
        player.minorHand = ['__test_placeholder__']
        player.occupationHand = ['__test_placeholder__']
      })
      session.state.players[0]!.minorPlayed = ['__TEST_display__']
      session.withCtx(() => requireActiveCardRegistry('display projection').setEffect({
        id: '__TEST_display__',
        computeExtraRoomCapacity: () => capacity,
        computeLockedFarmTiles: () => [{ row: 1, col: capacity }],
      }))
    }
    try {
      const payload = first.buildSyncPayload(first.getState(), 'p1')
      const frame = serializeSessionSnapshot(first.state, first).frame
      expect(payload.state.players[0]!.playerPanelSummary.housingCapacity.value).toBe(first.state.players[0]!.rooms + 1)
      expect(payload.state.players[0]!.lockedFarmTileKeys).toEqual(['1-1'])
      expect(frame.players[0]!.playerPanelSummary).toEqual(payload.state.players[0]!.playerPanelSummary)
      expect(frame.players[0]!.lockedFarmTileKeys).toEqual(['1-1'])
      expect(second.buildSyncPayload(second.getState(), 'p1').state.players[0]!.lockedFarmTileKeys).toEqual(['1-3'])
      const restored = rehydrateState(JSON.parse(JSON.stringify(frame)))
      expect(restored.state.players[0]).not.toHaveProperty('playerPanelSummary')
      expect(restored.state.players[0]).not.toHaveProperty('lockedFarmTileKeys')
      expect(restored.state.players[0]).not.toHaveProperty('moorSpecialActionAvailability')
    } finally { first.dispose(); second.dispose() }
  })

  it('refreshes Moor display availability from authoritative resources and worker health', () => {
    const session = new GameSession(9103, undefined, {
      playerCount: 2,
      enableFarmersOfTheMoor: true,
      allowIncompleteFarmersOfTheMoorMinorDeal: true,
    })
    try {
      session.state.players.forEach(player => {
        player.minorHand = ['__test_placeholder__']
        player.occupationHand = ['__test_placeholder__']
      })
      session.state.currentPlayerIndex = 0
      const player = session.state.players[0]!
      const card = session.state.farmersOfTheMoor!.specialActionCards.find(card => card.actions.includes('horse-market'))!
      card.location = { kind: 'market' }
      const available = () => session.buildSyncPayload(session.getState(), player.id).state.players[0]!.moorSpecialActionAvailability[card.id]!['horse-market']
      player.resources.food = 0
      expect(session.buildSyncPayload(session.getState(), player.id).state.players[0]!.moorSpecialActionAvailability[card.id]!.cardUsable).toBe(true)
      expect(available()).toBe(false)
      player.resources.food = 1
      expect(available()).toBe(true)
      const frame = serializeSessionSnapshot(session.state, session).frame
      expect(frame.players[0]!.moorSpecialActionAvailability[card.id]!['horse-market']).toBe(true)
      player.sickWorkerIds = player.workers.filter(worker => worker.isActive).map(worker => worker.id)
      expect(available()).toBe(false)
      player.sickWorkerIds = []
      card.location = { kind: 'playerFaceUp', playerId: session.state.players[1]!.id }
      expect(available()).toBe(false)
      player.resources.food = 3
      expect(available()).toBe(true)
      card.location = { kind: 'playerFaceUp', playerId: player.id }
      expect(session.buildSyncPayload(session.getState(), player.id).state.players[0]!.moorSpecialActionAvailability[card.id]!.cardUsable).toBe(false)
      expect(available()).toBe(false)
      card.location = { kind: 'market' }
      session.state.currentPlayerIndex = 1
      expect(available()).toBe(false)
    } finally { session.dispose() }
  })

  it('keeps HTTP debug null-viewer payload unfiltered while WS null-viewer payload is a spectator view', () => {
    const session = new GameSession(42)
    const resp = session.withCtx(() => session.getState())
    const p0 = resp.state.players[0]!
    const waitResp: SessionResponse = {
      ...resp,
      interaction: {
        stateId: 'wait',
        playerIndex: 0,
        sourceCard: 'E078_SleightofHand',
        promptKey: 'ui.interactionSleightOfHand',
        request: {
          kind: 'resource-batch-exchange-select',
          cardId: 'E078_SleightofHand',
          discardAvailableByResource: { wood: 2 },
          receiveResources: ['wood', 'clay', 'reed', 'stone'],
          maxTotal: 2,
        },
        allowedCommands: ['commitSelection'],
        anytimeActions: [],
      },
    }

    const spectator = session.buildSyncPayload(waitResp, null, 'viewer')
    const debug = session.buildSyncPayload(waitResp, null, 'debug')
    const player = session.buildSyncPayload(waitResp, p0.id, 'viewer')

    expect(spectator.interaction.stateId === 'wait' && spectator.interaction.request.kind).toBe('private-prompt')
    expect(spectator.privateEvents ?? []).toEqual([])
    expect(spectator.cardAvailability).toBeUndefined()

    expect(debug.interaction.stateId === 'wait' && debug.interaction.request.kind).toBe('resource-batch-exchange-select')
    expect(debug.privateEvents ?? []).toEqual([])
    expect(debug.cardAvailability).toEqual(waitResp.cardAvailability)

    expect(player.interaction.stateId === 'wait' && player.interaction.request.kind).toBe('resource-batch-exchange-select')
    expect(player.privateEvents).toEqual([
      expect.objectContaining({
        type: 'private.promptShown',
        recipientPlayerId: p0.id,
        promptKind: 'resource-batch-exchange-select',
        sourceCard: 'E078_SleightofHand',
      }),
    ])
    expect(session.buildSyncPayload(waitResp, p0.id, 'viewer')).toEqual(player)
  })

  it('includes custom-card runtime warnings only in HTTP debug payloads', () => {
    const session = new GameSession(42)
    session.cardWarnings.push('runtime hook failed')
    const resp = session.withCtx(() => session.getState())

    expect(session.buildSyncPayload(resp, null, 'debug').cardWarnings)
      .toEqual(['runtime hook failed'])
    expect(session.buildSyncPayload(resp, null, 'viewer').cardWarnings)
      .toBeUndefined()
  })

  it('derives every viewer payload from one canonical custom projection', () => {
    const session = new GameSession(42, undefined, { playerCount: 6 })
    let hookCalls = 0
    session.withCtx(() => {
      requireActiveCardRegistry('sync payload projection test').setEffect({
        id: '__TEST_projection__',
        onComputeAnimalZones: () => {
          hookCalls += 1
          return []
        },
      })
      session.state.players.forEach((player) => {
        player.minorPlayed = ['__TEST_projection__']
      })
      const response = session.getState()
      const serialized = serializeState(response.state, { engineStack: session.getEngineStack() })
      const canonicalHookCalls = hookCalls

      session.buildSyncPayload(response, null, 'debug', serialized)
      session.buildSyncPayload(response, null, 'viewer', serialized)
      response.state.players.forEach((player) => {
        session.buildSyncPayload(response, player.id, 'viewer', serialized)
      })

      expect(canonicalHookCalls).toBeGreaterThan(0)
      expect(hookCalls).toBe(canonicalHookCalls)
    })
    session.dispose()
  })
})
