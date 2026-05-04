import { describe, expect, it } from 'vitest'
import { GameSession } from '../../../server/game/authoritative-session'
import { setWorkersAtHome } from '../player'
import { rehydrateState, serializeState } from '../serialization'

describe('serialization cursor round-trip', () => {
  // ── reorganize sub-flow ────────────────────────────────────────────────
  // Mirrors server/__tests__/reorganize-engine-session.test.ts setup so we
  // drive the session into a real animal-reorg pending interaction, then
  // serialize → rehydrate into a fresh session and verify the engineStack
  // sub-flow is reconstructed.
  const setupReorgPending = () => {
    const session = new GameSession()
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    state.currentPlayerIndex = 0
    state.round = 5
    state.roundPhase = 'work'

    const player = state.players[0]!
    setWorkersAtHome(state, player, 2)
    player.resources = { ...player.resources, food: 5, boar: 0 }
    player.pastures = [
      {
        id: 'pasture-1',
        size: 2,
        tiles: [
          { row: 0, col: 0 },
          { row: 0, col: 1 },
        ],
        stables: 0,
        animalType: null,
        animalCount: 0,
      },
    ]

    const pigMarket = state.actionSpaces.find((s) => s.id === 'pig-market')
    if (pigMarket) pigMarket.resources.boar = 1

    session.loadState(state)
    session.takeAction(0, 'pig-market')
    return session
  }

  it('reorganize sub-flow survives serialize/rehydrate', () => {
    const session = setupReorgPending()

    // Sanity: a real animal-reorg pending interaction is in-flight.
    const before = session.getState()
    expect(before.pending.type).toBe('choice')
    if (before.pending.type === 'choice') {
      expect(before.pending.promptKey).toBe('ui.interactionAnimalReorg')
    }
    // Stack depth is 2: the outer pig-market action frame + the pushed
    // reorganize sub-flow frame on top.
    const initialDepth = session.getEngineStack().depth()
    expect(initialDepth).toBeGreaterThanOrEqual(1)
    expect(session.getEngineStack().current()?.reason).toBe('reorganize')

    // Serialize with the cursor.
    const serialized = serializeState(before.state, {
      engineStack: session.getEngineStack(),
    })
    expect(serialized.engineStack.frames).toHaveLength(initialDepth)
    expect(serialized.engineStack.frames[initialDepth - 1]!.reason).toBe('reorganize')

    // Round-trip via JSON to mirror the WS / SQLite persistence path.
    const wireSafe = JSON.parse(JSON.stringify(serialized))
    const rehydrated = rehydrateState(wireSafe)
    expect(rehydrated.engineStackCursor.frames).toHaveLength(initialDepth)

    // Construct a fresh session from the cursor and verify it can resolve the
    // pending interaction normally.
    const restored = new GameSession(rehydrated)
    expect(restored.getEngineStack().depth()).toBe(initialDepth)
    expect(restored.getEngineStack().current()?.reason).toBe('reorganize')

    const resp = restored.resolveChoice(0, 'confirm', [
      { id: 'pasture-1', zoneType: 'pasture', animalType: 'boar', animalCount: 1 },
    ] as unknown as Record<string, unknown>)
    expect(resp.ok).toBe(true)
    expect(resp.state.players[0]!.resources.boar).toBe(1)
    expect(resp.state.players[0]!.pastures[0]!.animalType).toBe('boar')
    expect(resp.state.players[0]!.pastures[0]!.animalCount).toBe(1)
  })

  // ── plain choice sub-flow (plow) ───────────────────────────────────────
  // Plow presents an InteractionRequest of kind 'choice' (farm-tile select).
  // We drive the engine into that pending state, round-trip the cursor, and
  // check the engineStack frame is reconstructed and resolvable.
  it('plain choice sub-flow (plow) survives serialize/rehydrate', () => {
    const session = new GameSession()
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    state.currentPlayerIndex = 0
    state.round = 1
    state.roundPhase = 'work'

    const player = state.players[0]!
    setWorkersAtHome(state, player, 2)
    session.loadState(state)

    const resp = session.takeAction(0, 'farmland')
    expect(resp.ok).toBe(true)
    expect(resp.pending.type).toBe('choice')
    expect(session.getEngineStack().depth()).toBeGreaterThanOrEqual(1)

    const serialized = serializeState(session.getState().state, {
      engineStack: session.getEngineStack(),
    })
    expect(serialized.engineStack.frames.length).toBeGreaterThanOrEqual(1)

    // Round-trip via JSON.
    const wireSafe = JSON.parse(JSON.stringify(serialized))
    const rehydrated = rehydrateState(wireSafe)
    expect(rehydrated.engineStackCursor.frames.length).toBeGreaterThanOrEqual(1)

    const restored = new GameSession(rehydrated)
    expect(restored.getEngineStack().depth()).toBeGreaterThanOrEqual(1)

    // The pending interaction is preserved (plow surfaces a 'choice' /
    // farm-position pick) and the engine state matches what the original
    // session had pre-serialize.
    const restoredResp = restored.getState()
    const beforeResp = session.getState()
    expect(restoredResp.pending.type).toBe(beforeResp.pending.type)
    if (restoredResp.pending.type === 'choice' && beforeResp.pending.type === 'choice') {
      // Same prompt + same set of choice values across the round-trip.
      expect(restoredResp.pending.promptKey).toBe(beforeResp.pending.promptKey)
      expect(restoredResp.pending.options.map((o) => o.value).sort()).toEqual(
        beforeResp.pending.options.map((o) => o.value).sort(),
      )
    }
  })

  // ── Task 9 stubs ──────────────────────────────────────────────────────
  // The 'confirm-next-player', 'confirm-player-switch', and 'feed' kinds are
  // emitted by GameCore today via the legacy pending model, not via engine
  // sub-flow frames. Task 9 will route them through engineStack so they too
  // can round-trip. Until then these tests are placeholders.
  it.todo('confirm-next-player sub-flow survives serialize/rehydrate (Task 9)')
  it.todo('confirm-player-switch sub-flow survives serialize/rehydrate (Task 9)')
  it.todo('feed sub-flow survives serialize/rehydrate (Task 9)')
})
