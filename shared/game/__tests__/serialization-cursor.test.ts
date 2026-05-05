import { describe, expect, it } from 'vitest'
import { GameSession } from '../../../server/game/authoritative-session'
import { setWorkersAtHome } from '../player'
import { rehydrateState, serializeState } from '../serialization'
import { isLegacyChoicePending } from '../../../server/__tests__/_helpers/legacy-confirms'

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
    expect(before.interaction.stateId).toBe('wait')
    if (before.interaction.stateId === 'wait') {
      expect(before.interaction.promptKey).toBe('ui.interactionAnimalReorg')
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
    expect(resp.interaction.stateId).toBe('wait')
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
    if (restoredResp.interaction.stateId === 'wait' && beforeResp.interaction.stateId === 'wait') {
      // Same prompt + same set of choice values across the round-trip.
      expect(restoredResp.interaction.promptKey).toBe(beforeResp.interaction.promptKey)
      expect(restoredResp.interaction.options?.map((o) => o.value).sort()).toEqual(
        beforeResp.interaction.options?.map((o) => o.value).sort(),
      )
    }
  })

  // ── confirm-next-player sub-flow (Task 9) ─────────────────────────────
  // Drive a normal worker-placement turn to completion: takeAction emits a
  // synthetic '__interaction_only__' frame whose InteractionNode carries
  // request.kind === 'confirm-next-player'. Round-trip the cursor and verify
  // the restored session can resolve the prompt to advance the turn.
  it('confirm-next-player sub-flow survives serialize/rehydrate', () => {
    const session = new GameSession()
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    state.currentPlayerIndex = 0
    state.round = 1
    state.roundPhase = 'work'

    const player = state.players[0]!
    setWorkersAtHome(state, player, 2)

    session.loadState(state)
    const resp = session.takeAction(0, 'day-laborer')
    expect(resp.ok).toBe(true)
    expect(resp.interaction.stateId === 'wait' ? resp.interaction.request.kind : resp.interaction.stateId).toBe('confirm-next-player')

    const stack = session.getEngineStack()
    expect(stack.depth()).toBe(1)
    const top = stack.current()!
    expect(top.reason).toBe('confirm-next-player')
    const interaction = stack.peekInteraction()
    expect(interaction?.request?.kind).toBe('confirm-next-player')

    // Round-trip via JSON.
    const serialized = serializeState(session.getState().state, { engineStack: stack })
    expect(serialized.engineStack.frames).toHaveLength(1)
    expect(serialized.engineStack.frames[0]!.reason).toBe('confirm-next-player')
    const wireSafe = JSON.parse(JSON.stringify(serialized))
    const rehydrated = rehydrateState(wireSafe)

    const restored = new GameSession(rehydrated)
    expect(restored.getEngineStack().depth()).toBe(1)
    expect(restored.getEngineStack().current()?.reason).toBe('confirm-next-player')
    const restoredInteraction = restored.getEngineStack().peekInteraction()
    expect(restoredInteraction?.request?.kind).toBe('confirm-next-player')

    // Resolving the prompt advances to the next player and clears the stack.
    const after = restored.resolveChoice(0, 'confirm')
    expect(after.ok).toBe(true)
    expect(isLegacyChoicePending(after)).toBe(false)
    expect(after.state.currentPlayerIndex).toBe(1)
    expect(restored.getEngineStack().depth()).toBe(0)
  })

  // ── confirm-player-switch sub-flow (Task 9) ───────────────────────────
  // A128 RiparianBuilder hosts a deferred player-switch: when player 1 takes
  // reed-bank, the owner (player 0) gets a transparent visit that defers the
  // switch until a real choice surfaces. The deferral pushes a synthetic
  // '__interaction_only__' frame on top of the parent action frame.
  it('confirm-player-switch sub-flow survives serialize/rehydrate', () => {
    const session = new GameSession()
    const state = session.getState().state
    state.players = state.players.slice(0, 3)
    state.currentPlayerIndex = 1

    const owner = state.players[0]!
    owner.occupationPlayed.push('A128_RiparianBuilder')
    owner.houseType = 'clay'
    owner.rooms = 2
    owner.resources = { ...owner.resources, wood: 5, clay: 10, reed: 6 }

    const actor = state.players[1]!
    setWorkersAtHome(state, actor, 2)

    const reedBank = state.actionSpaces.find((s) => s.id === 'reed-bank')
    if (!reedBank) throw new Error('reed-bank space missing')
    reedBank.resources.reed = 3

    session.loadState(state)
    const resp = session.takeAction(1, 'reed-bank')
    expect(resp.ok).toBe(true)
    expect(resp.interaction.stateId === 'wait' ? resp.interaction.request.kind : resp.interaction.stateId).toBe('confirm-player-switch')

    const stack = session.getEngineStack()
    expect(stack.depth()).toBeGreaterThanOrEqual(2)
    const top = stack.current()!
    expect(top.reason).toBe('confirm-player-switch')
    const interaction = stack.peekInteraction()
    expect(interaction?.request?.kind).toBe('confirm-player-switch')

    // Round-trip via JSON.
    const initialDepth = stack.depth()
    const serialized = serializeState(session.getState().state, { engineStack: stack })
    expect(serialized.engineStack.frames).toHaveLength(initialDepth)
    expect(serialized.engineStack.frames[initialDepth - 1]!.reason).toBe('confirm-player-switch')
    const wireSafe = JSON.parse(JSON.stringify(serialized))
    const rehydrated = rehydrateState(wireSafe)

    const restored = new GameSession(rehydrated)
    expect(restored.getEngineStack().depth()).toBe(initialDepth)
    expect(restored.getEngineStack().current()?.reason).toBe('confirm-player-switch')
    const restoredInteraction = restored.getEngineStack().peekInteraction()
    expect(restoredInteraction?.request?.kind).toBe('confirm-player-switch')

    // Resolving the synthetic frame pops it and resumes the parent action
    // engine. The parent's exact follow-up (a 'choice' for reed-bank's OR
    // arms, or a no-op 'none' once the InteractionNode rehydrates as
    // already-resolved) is not the contract we're asserting here — what we
    // care about is that the round-trip preserved the synthetic frame and
    // resolveChoice no longer reports an error.
    const after = restored.resolveChoice(0, 'confirm')
    expect(after.ok).toBe(true)
  })

  // ── feed sub-flow (Task 9) ────────────────────────────────────────────
  // Drive harvest with a player that owes food: the harvest queue pushes a
  // synthetic '__interaction_only__' frame whose InteractionNode carries
  // request.kind === 'feed'. Round-trip and resolve.
  it('feed sub-flow survives serialize/rehydrate', () => {
    const session = new GameSession()
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    state.currentPlayerIndex = 0
    state.round = 4
    state.roundPhase = 'work'

    // Both players have all workers placed so performRoundEnd can advance to
    // the harvest phase. Player 0 has grain to convert, owes food.
    // Order matters: setWorkersAtHome routes the workers into a synthetic
    // test-sink space, so we must NOT clear actionSpaces.takenBy afterwards.
    state.players.forEach((p) => setWorkersAtHome(state, p, 0))
    const p0 = state.players[0]!
    p0.familyMembers = 2
    p0.resources = { ...p0.resources, food: 0, grain: 3 }
    const p1 = state.players[1]!
    p1.familyMembers = 1
    p1.resources = { ...p1.resources, food: 5 }

    session.loadState(state)
    const resp = session.performRoundEnd()
    expect(resp.ok).toBe(true)
    expect(resp.interaction.stateId === 'wait' ? resp.interaction.request.kind : resp.interaction.stateId).toBe('feed')

    const stack = session.getEngineStack()
    expect(stack.depth()).toBeGreaterThanOrEqual(1)
    const top = stack.current()!
    expect(top.reason).toBe('feed')
    const interaction = stack.peekInteraction()
    expect(interaction?.request?.kind).toBe('feed')

    // Round-trip via JSON.
    const initialDepth = stack.depth()
    const serialized = serializeState(session.getState().state, { engineStack: stack })
    expect(serialized.engineStack.frames).toHaveLength(initialDepth)
    expect(serialized.engineStack.frames[initialDepth - 1]!.reason).toBe('feed')
    const wireSafe = JSON.parse(JSON.stringify(serialized))
    const rehydrated = rehydrateState(wireSafe)

    const restored = new GameSession(rehydrated)
    expect(restored.getEngineStack().depth()).toBe(initialDepth)
    expect(restored.getEngineStack().current()?.reason).toBe('feed')
    const restoredInteraction = restored.getEngineStack().peekInteraction()
    expect(restoredInteraction?.request?.kind).toBe('feed')

    // Resolve with empty selections (player just begs the deficit). The feed
    // queue empties and the synthetic frame is popped.
    const after = restored.resolveChoice(0, 'confirm', { selections: [] })
    expect(after.ok).toBe(true)
    // Either none (queue empty → breed phase) or another harvestFeed for p1
    // is acceptable; what we care about is that the synthetic 'feed' frame
    // doesn't accumulate.
    const remainingFeedFrames = restored.getEngineStack().depth() > 0
      && restored.getEngineStack().current()?.reason === 'feed'
    if (after.interaction.stateId === 'wait' && after.interaction.request.kind === 'feed') {
      expect(remainingFeedFrames).toBe(true)
    } else {
      expect(isLegacyChoicePending(after)).toBe(false)
    }
  })
})
