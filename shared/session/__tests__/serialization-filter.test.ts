import { describe, expect, it } from 'vitest'
import type { GameEvent } from '../../contract/events'
import type { GameState } from '../../contract/types'
import type { DraftState } from '../../draft/types'
import { createInitialState } from '../state-bootstrap'
import {
  filterSerializedStateForPlayer,
  rehydrateState,
  serializeState,
  serializeStateForPlayer,
} from '../serialization'
import { EngineStack } from '../../engine'

const emptyCtx = () => ({ engineStack: new EngineStack() })

// ---------- helpers ----------

/**
 * Build a 2-player state in the normal (non-draft) 'playing' phase with real
 * dealt hands. Then sprinkle some non-secret fields to verify they pass
 * through untouched.
 */
function makePlayingState(): GameState {
  const state = createInitialState(42, { playerCount: 2 })
  // Guarantee hands have content
  expect(state.players[0].occupationHand.length).toBeGreaterThan(0)
  expect(state.players[0].minorHand.length).toBeGreaterThan(0)
  expect(state.players[1].occupationHand.length).toBeGreaterThan(0)
  expect(state.players[1].minorHand.length).toBeGreaterThan(0)
  // Mutate some public fields so the test can check they survive filtering.
  state.players[0].resources.wood = 3
  state.players[0].resources.food = 5
  state.players[1].resources.clay = 2
  state.players[0].playedCards = ['foo']
  state.players[1].playedCards = ['bar', 'baz']
  return state
}

/**
 * Build a 2-player state in the 'draft' phase so `state.draft` (and its pools)
 * are populated by real code.
 */
function makeDraftState(): GameState {
  const state = createInitialState(1337, {
    playerCount: 2,
    draftMode: 'simultaneous',
    draftPoolSize: 7,
  })
  expect(state.draft).not.toBeNull()
  expect(state.draft!.pools.p1.occ.length).toBe(7)
  expect(state.draft!.pools.p1.minor.length).toBe(7)
  expect(state.draft!.pools.p2.occ.length).toBe(7)
  expect(state.draft!.pools.p2.minor.length).toBe(7)
  return state
}

// ---------- tests ----------

describe('serializeStateForPlayer', () => {
  it('applies the same visibility rules to an archived serialized frame', () => {
    const state = makePlayingState()
    const serialized = serializeState(state, emptyCtx())

    expect(filterSerializedStateForPlayer(serialized, 'p1')).toEqual(
      serializeStateForPlayer(state, 'p1', emptyCtx()),
    )
  })

  it('removes engine cursors from a player-filtered frame', () => {
    const serialized = serializeState(makePlayingState(), emptyCtx())
    serialized.engineStack = {
      frames: [{
        source: {
          kind: 'flow',
          flow: { type: 'leaf', actionId: 'gain', params: {} },
        },
        engineSnapshot: {
          nodeStates: [{ id: 'secret-choice', state: 'waiting' }],
          pendingData: [{
            nodeId: 'secret-choice',
            pending: {
              hostNodeId: 'secret-choice',
              request: {
                kind: 'choice',
                options: [{
                  value: 'secret-card',
                  labelKey: 'ui.cursorTestChoice',
                }],
              },
              choices: [{
                value: 'secret-card',
                labelKey: 'ui.cursorTestChoice',
              }],
              effectiveOwnerPlayerId: 'p2',
            },
          }],
          compositeEmit: null,
        },
        ownerPlayerIndex: 1,
        spaceId: 'secret-space',
        stageResume: null,
        deferredPlayerSwitch: null,
        reason: 'top-level',
      }],
    }

    const filtered = filterSerializedStateForPlayer(serialized, 'p1')

    expect(JSON.stringify(serialized.engineStack)).toContain('secret-card')
    expect(filtered.engineStack).toEqual({ frames: [] })
  })

  it('round-trips six players through serialize and rehydrate', () => {
    const state = createInitialState(42, {
      playerCount: 6,
      playerNames: ['playerA', 'playerB', 'playerC', 'playerD', 'playerE', 'playerF'],
    })

    const serialized = serializeState(state, emptyCtx())
    const restored = rehydrateState(JSON.parse(JSON.stringify(serialized))).state

    expect(restored.players).toHaveLength(6)
    expect(restored.players.every((player) => !('pastureCapacities' in player))).toBe(true)
    expect(restored.players.map((player) => player.id)).toEqual(['p1', 'p2', 'p3', 'p4', 'p5', 'p6'])
    expect(restored.players.map((player) => player.name)).toEqual(['playerA', 'playerB', 'playerC', 'playerD', 'playerE', 'playerF'])
    expect(restored.players.map((player) => player.color)).toEqual(['red', 'blue', 'black', 'yellow', 'green', 'purple'])
  })

  it('masks other player hands with ? of same length, preserves viewer hand', () => {
    const state = makePlayingState()
    const p1Occ = [...state.players[0].occupationHand]
    const p1Minor = [...state.players[0].minorHand]
    const p2Occ = [...state.players[1].occupationHand]
    const p2Minor = [...state.players[1].minorHand]

    const out = serializeStateForPlayer(state, 'p1', emptyCtx())
    const outP1 = out.players.find((p) => p.id === 'p1')!
    const outP2 = out.players.find((p) => p.id === 'p2')!

    // Viewer's hand is unchanged
    expect(outP1.occupationHand).toEqual(p1Occ)
    expect(outP1.minorHand).toEqual(p1Minor)

    // Opponent's hand is masked to same-length arrays of '?'
    expect(outP2.occupationHand).toEqual(Array(p2Occ.length).fill('?'))
    expect(outP2.minorHand).toEqual(Array(p2Minor.length).fill('?'))
  })

  it('preserves all non-secret fields (resources, fields, played cards, rooms)', () => {
    const state = makePlayingState()
    const raw = serializeState(state, emptyCtx())
    const filtered = serializeStateForPlayer(state, 'p1', emptyCtx())

    // Top-level scalars / public structures should match verbatim.
    expect(filtered.round).toBe(raw.round)
    expect(filtered.phase).toBe(raw.phase)
    expect(filtered.roundPhase).toBe(raw.roundPhase)
    expect(filtered.currentPlayerIndex).toBe(raw.currentPlayerIndex)
    expect(filtered.actionSpaces).toEqual(raw.actionSpaces)
    expect(filtered.log).toEqual(raw.log)
    expect(filtered.availableMajorImprovements).toEqual(
      raw.availableMajorImprovements,
    )

    // Public player fields should match verbatim for BOTH players.
    for (let i = 0; i < raw.players.length; i++) {
      const rp = raw.players[i]
      const fp = filtered.players[i]
      expect(fp.id).toBe(rp.id)
      expect(fp.name).toBe(rp.name)
      expect(fp.color).toBe(rp.color)
      expect(fp.resources).toEqual(rp.resources)
      expect(fp.rooms).toBe(rp.rooms)
      expect(fp.houseType).toBe(rp.houseType)
      expect(fp.fields).toEqual(rp.fields)
      expect(fp.roomTiles).toEqual(rp.roomTiles)
      expect(fp.stableTiles).toEqual(rp.stableTiles)
      expect(fp.improvements).toEqual(rp.improvements)
      expect(fp.minorPlayed).toEqual(rp.minorPlayed)
      expect(fp.occupationPlayed).toEqual(rp.occupationPlayed)
      expect(fp.playedCards).toEqual(rp.playedCards)
      expect(fp.pastures).toEqual(rp.pastures)
      expect(fp.fenceSegments).toEqual(rp.fenceSegments)
      expect(fp.startPlayer).toBe(rp.startPlayer)
    }
  })

  it('when draft is null, behaves like serializeState for draft', () => {
    const state = makePlayingState()
    expect(state.draft).toBeNull()
    const out = serializeStateForPlayer(state, 'p1', emptyCtx())
    expect(out.draft).toBeNull()
  })

  it('masks draft.pools for non-viewers, preserves viewer pool', () => {
    const state = makeDraftState()
    const p1PoolOcc = [...state.draft!.pools.p1.occ]
    const p1PoolMinor = [...state.draft!.pools.p1.minor]
    const p2PoolOcc = [...state.draft!.pools.p2.occ]
    const p2PoolMinor = [...state.draft!.pools.p2.minor]

    const out = serializeStateForPlayer(state, 'p1', emptyCtx())
    expect(out.draft).not.toBeNull()
    const draft = out.draft as DraftState

    expect(draft.pools.p1.occ).toEqual(p1PoolOcc)
    expect(draft.pools.p1.minor).toEqual(p1PoolMinor)
    expect(draft.pools.p2.occ).toEqual(Array(p2PoolOcc.length).fill('?'))
    expect(draft.pools.p2.minor).toEqual(Array(p2PoolMinor.length).fill('?'))
  })

  it('masks staged draft pools for non-viewers', () => {
    const state = makeDraftState()
    state.draft = {
      ...state.draft!,
      stage: 'farmersOfTheMoorMinor',
      stageIndex: 1,
      stages: [
        {
          kind: 'occupation',
          poolSize: 1,
          totalRounds: 1,
          pools: {
            p1: { occ: ['occ-p1'], minor: [] },
            p2: { occ: ['occ-p2'], minor: [] },
          },
        },
        {
          kind: 'farmersOfTheMoorMinor',
          poolSize: 1,
          totalRounds: 1,
          pools: {
            p1: { occ: [], minor: ['fom-p1'] },
            p2: { occ: [], minor: ['fom-p2'] },
          },
        },
      ],
    }

    const out = serializeStateForPlayer(state, 'p1', emptyCtx())
    const draft = out.draft as DraftState

    expect(draft.stages![0]!.pools.p1.occ).toEqual(['occ-p1'])
    expect(draft.stages![0]!.pools.p2.occ).toEqual(['?'])
    expect(draft.stages![1]!.pools.p1.minor).toEqual(['fom-p1'])
    expect(draft.stages![1]!.pools.p2.minor).toEqual(['?'])
  })

  it('masks non-viewer draft.kept and submitted pendingPicks', () => {
    const state = makeDraftState()
    state.draft!.pendingPicks.p1 = {
      occ: state.draft!.pools.p1.occ[0]!,
      minor: state.draft!.pools.p1.minor[0]!,
    }
    state.draft!.pendingPicks.p2 = {
      occ: state.draft!.pools.p2.occ[0]!,
      minor: state.draft!.pools.p2.minor[0]!,
    }
    state.draft!.kept.p1 = {
      occ: [state.draft!.pools.p1.occ[0]!, state.draft!.pools.p1.occ[1]!],
      minor: [state.draft!.pools.p1.minor[0]!],
    }
    state.draft!.kept.p2 = {
      occ: [state.draft!.pools.p2.occ[0]!],
      minor: [state.draft!.pools.p2.minor[0]!, state.draft!.pools.p2.minor[1]!],
    }
    const raw = serializeState(state, emptyCtx())
    const filtered = serializeStateForPlayer(state, 'p1', emptyCtx())
    const spectator = serializeStateForPlayer(state, null, emptyCtx())
    expect(raw.draft).not.toBeNull()
    expect(filtered.draft).not.toBeNull()
    expect(spectator.draft).not.toBeNull()

    const r = raw.draft as DraftState
    const f = filtered.draft as DraftState
    const s = spectator.draft as DraftState
    expect(f.kept.p1).toEqual(r.kept.p1)
    expect(f.kept.p2).toEqual({ occ: ['?'], minor: ['?', '?'] })
    expect(s.kept.p1).toEqual({ occ: ['?', '?'], minor: ['?'] })
    expect(s.kept.p2).toEqual({ occ: ['?'], minor: ['?', '?'] })
    expect(f.pendingPicks.p1).toEqual(r.pendingPicks.p1)
    expect(f.pendingPicks.p2).toEqual({ occ: '?', minor: '?' })
    expect(s.pendingPicks.p1).toEqual({ occ: '?', minor: '?' })
    expect(s.pendingPicks.p2).toEqual({ occ: '?', minor: '?' })
    expect(f.round).toBe(r.round)
    expect(f.totalRounds).toBe(r.totalRounds)
    expect(f.poolSize).toBe(r.poolSize)
    expect(f.seatOrder).toEqual(r.seatOrder)
    expect(f.mode).toBe(r.mode)
  })

  it('preserves null values when masking non-viewer pendingPicks', () => {
    const state = makeDraftState()
    state.draft!.pendingPicks.p1 = {
      occ: state.draft!.pools.p1.occ[0]!,
      minor: state.draft!.pools.p1.minor[0]!,
    }
    state.draft!.pendingPicks.p2 = { occ: null, minor: null }

    const filtered = serializeStateForPlayer(state, 'p1', emptyCtx())
    const spectator = serializeStateForPlayer(state, null, emptyCtx())
    const f = filtered.draft as DraftState
    const s = spectator.draft as DraftState

    expect(f.pendingPicks.p1).toEqual(state.draft!.pendingPicks.p1)
    expect(f.pendingPicks.p2).toEqual({ occ: null, minor: null })
    expect(s.pendingPicks.p1).toEqual({ occ: '?', minor: '?' })
    expect(s.pendingPicks.p2).toEqual({ occ: null, minor: null })
  })

  it('viewerPlayerId=null → all hands + pools masked (spectator mode)', () => {
    const state = makeDraftState()
    const out = serializeStateForPlayer(state, null, emptyCtx())
    for (const p of out.players) {
      expect(p.occupationHand.every((c) => c === '?')).toBe(true)
      expect(p.minorHand.every((c) => c === '?')).toBe(true)
    }
    expect(out.draft).not.toBeNull()
    for (const pool of Object.values((out.draft as DraftState).pools)) {
      expect(pool.occ.every((c) => c === '?')).toBe(true)
      expect(pool.minor.every((c) => c === '?')).toBe(true)
    }
  })

  it('viewer not in players → treated as spectator', () => {
    const state = makeDraftState()
    const out = serializeStateForPlayer(state, 'nonexistent', emptyCtx())
    for (const p of out.players) {
      expect(p.occupationHand.every((c) => c === '?')).toBe(true)
      expect(p.minorHand.every((c) => c === '?')).toBe(true)
    }
    for (const pool of Object.values((out.draft as DraftState).pools)) {
      expect(pool.occ.every((c) => c === '?')).toBe(true)
      expect(pool.minor.every((c) => c === '?')).toBe(true)
    }
  })

  it('does not mutate input state', () => {
    const state = makeDraftState()
    const snapshot = JSON.parse(
      JSON.stringify(serializeState(state, emptyCtx())),
    )
    serializeStateForPlayer(state, 'p1', emptyCtx())
    serializeStateForPlayer(state, null, emptyCtx())
    serializeStateForPlayer(state, 'p2', emptyCtx())
    expect(JSON.parse(JSON.stringify(serializeState(state, emptyCtx())))).toEqual(snapshot)
  })

  it('masks empty hands as empty arrays (no spurious ? added)', () => {
    const state = makePlayingState()
    state.players[1].occupationHand = []
    state.players[1].minorHand = []
    const out = serializeStateForPlayer(state, 'p1', emptyCtx())
    const p2 = out.players.find((p) => p.id === 'p2')!
    expect(p2.occupationHand).toEqual([])
    expect(p2.minorHand).toEqual([])
  })

  it('masks cardStates and card-state events for cards still hidden in opponent hands', () => {
    const state = makePlayingState()
    const p2 = state.players[1]!
    p2.minorHand = ['D036_BreedRegistry']
    p2.minorPlayed = ['B021_HayloftBarn']
    p2.cardStates = {
      D036_BreedRegistry: { extraData: { boardSheep: 1 } },
      B021_HayloftBarn: { extraData: { foodCount: 2 } },
    }
    const hiddenTriggerEvent: GameEvent = {
      schemaVersion: 1,
      id: '100',
      seq: 100,
      round: state.round,
      phase: state.roundPhase,
      type: 'card.triggered',
      visibility: 'public',
      cardId: 'D036_BreedRegistry',
      sourceCardId: 'D036_BreedRegistry',
      triggerActionId: 'gain-sheep',
      accepted: true,
    }
    const hiddenEvent: GameEvent = {
      schemaVersion: 1,
      id: '101',
      seq: 101,
      round: state.round,
      phase: state.roundPhase,
      type: 'card.stateChanged',
      visibility: 'public',
      cardId: 'D036_BreedRegistry',
      targetPlayerId: p2.id,
      key: 'boardSheep',
      value: 1,
    }
    const visibleEvent: GameEvent = {
      schemaVersion: 1,
      id: '102',
      seq: 102,
      round: state.round,
      phase: state.roundPhase,
      type: 'card.stateChanged',
      visibility: 'public',
      cardId: 'B021_HayloftBarn',
      targetPlayerId: p2.id,
      key: 'foodCount',
      value: 2,
    }
    state.events = [hiddenTriggerEvent, visibleEvent]
    state.nextEventSeq = 103
    const seededLog: GameState['log'] = [
      { key: 'log.cardTriggered', params: { cardId: 'D036_BreedRegistry' } },
      { key: 'log.cardTriggered', params: { cardId: 'B021_HayloftBarn' } },
      { key: 'log.existing' },
    ]
    state.publicEventArchive = [
      {
        schemaVersion: 1,
        id: '1',
        packetSeq: 1,
        type: 'publicEvents.committed',
        eventIds: ['100', '101', '102'],
        eventSeqs: [100, 101, 102],
        firstEventSeq: 100,
        lastEventSeq: 102,
      },
      {
        schemaVersion: 1,
        id: '2',
        packetSeq: 2,
        type: 'publicEvents.canceled',
        reason: 'undoStep',
        previousMaxSeq: 102,
        nextMaxSeq: 100,
        canceledEventIds: ['101', '102'],
        canceledSeqs: [101, 102],
        canceledEvents: [hiddenEvent, visibleEvent],
      },
    ]
    state.nextPublicEventArchivePacketSeq = 3
    const stateWithLog: GameState = { ...state, log: seededLog }

    const opponentView = serializeStateForPlayer(stateWithLog, 'p1', emptyCtx())
    const ownerView = serializeStateForPlayer(stateWithLog, p2.id, emptyCtx())
    const filteredP2 = opponentView.players.find((player) => player.id === p2.id)!
    const ownerP2 = ownerView.players.find((player) => player.id === p2.id)!

    expect(filteredP2.minorHand).toEqual(['?'])
    expect(filteredP2.cardStates.D036_BreedRegistry).toBeUndefined()
    expect(filteredP2.cardStates.B021_HayloftBarn).toEqual(p2.cardStates.B021_HayloftBarn)
    expect(opponentView.events.map((event) => event.id)).toEqual(['102'])
    expect(opponentView.events.map((event) => event.seq)).toEqual([1])
    expect(opponentView.log).toEqual([
      { key: 'log.cardTriggered', params: { cardId: 'B021_HayloftBarn' } },
      { key: 'log.existing' },
    ])
    expect(opponentView.nextEventSeq).toBe(2)
    expect(opponentView.nextPublicEventArchivePacketSeq).toBe(3)
    expect(opponentView.publicEventArchive).toEqual([
      {
        schemaVersion: 1,
        id: '1',
        packetSeq: 1,
        type: 'publicEvents.committed',
        eventIds: ['102'],
        eventSeqs: [1],
        firstEventSeq: 1,
        lastEventSeq: 1,
      },
      {
        schemaVersion: 1,
        id: '2',
        packetSeq: 2,
        type: 'publicEvents.canceled',
        reason: 'undoStep',
        previousMaxSeq: 1,
        nextMaxSeq: 0,
        canceledEventIds: ['102'],
        canceledSeqs: [1],
        canceledEvents: [{ ...visibleEvent, seq: 1 }],
      },
    ])
    expect(ownerP2.cardStates.D036_BreedRegistry).toEqual(p2.cardStates.D036_BreedRegistry)
    expect(ownerView.events.map((event) => event.id)).toEqual(['100', '102'])
    expect(ownerView.events.map((event) => event.seq)).toEqual([100, 102])
    expect(ownerView.log).toEqual(stateWithLog.log)
    expect(ownerView.publicEventArchive[1]).toMatchObject({
      canceledEventIds: ['101', '102'],
      canceledSeqs: [101, 102],
    })
  })

  it('does not filter visible archive entries that reuse a canceled hidden event id', () => {
    const state = makePlayingState()
    const p2 = state.players[1]!
    p2.minorHand = ['D036_BreedRegistry']
    p2.minorPlayed = ['B021_HayloftBarn']
    p2.cardStates = {
      D036_BreedRegistry: { extraData: { boardSheep: 1 } },
      B021_HayloftBarn: { extraData: { foodCount: 2 } },
    }
    const hiddenEvent: GameEvent = {
      schemaVersion: 1,
      id: '1',
      seq: 1,
      round: state.round,
      phase: state.roundPhase,
      type: 'card.stateChanged',
      visibility: 'public',
      cardId: 'D036_BreedRegistry',
      targetPlayerId: p2.id,
      key: 'boardSheep',
      value: 1,
    }
    const visibleEvent: GameEvent = {
      schemaVersion: 1,
      id: '1',
      seq: 1,
      round: state.round,
      phase: state.roundPhase,
      type: 'card.stateChanged',
      visibility: 'public',
      cardId: 'B021_HayloftBarn',
      targetPlayerId: p2.id,
      key: 'foodCount',
      value: 2,
    }
    state.events = [visibleEvent]
    state.nextEventSeq = 2
    state.publicEventArchive = [
      {
        schemaVersion: 1,
        id: '1',
        packetSeq: 1,
        type: 'publicEvents.committed',
        eventIds: ['1'],
        eventSeqs: [1],
        firstEventSeq: 1,
        lastEventSeq: 1,
      },
      {
        schemaVersion: 1,
        id: '2',
        packetSeq: 2,
        type: 'publicEvents.canceled',
        reason: 'undoStep',
        previousMaxSeq: 1,
        nextMaxSeq: 0,
        canceledEventIds: ['1'],
        canceledSeqs: [1],
        canceledEvents: [hiddenEvent],
      },
      {
        schemaVersion: 1,
        id: '3',
        packetSeq: 3,
        type: 'publicEvents.committed',
        eventIds: ['1'],
        eventSeqs: [1],
        firstEventSeq: 1,
        lastEventSeq: 1,
      },
    ]
    state.nextPublicEventArchivePacketSeq = 4

    const opponentView = serializeStateForPlayer(state, 'p1', emptyCtx())

    expect(opponentView.events).toEqual([visibleEvent])
    expect(opponentView.nextEventSeq).toBe(2)
    expect(opponentView.publicEventArchive).toEqual([
      {
        schemaVersion: 1,
        id: '1',
        packetSeq: 1,
        type: 'publicEvents.committed',
        eventIds: ['1'],
        eventSeqs: [1],
        firstEventSeq: 1,
        lastEventSeq: 1,
      },
    ])
    expect(opponentView.nextPublicEventArchivePacketSeq).toBe(2)
  })

  it('remaps committed archive seqs with event ids when visible seqs are reused', () => {
    const state = makePlayingState()
    const p2 = state.players[1]!
    p2.minorHand = ['D036_BreedRegistry']
    p2.minorPlayed = ['B021_HayloftBarn']
    p2.cardStates = {
      D036_BreedRegistry: { extraData: { boardSheep: 1 } },
      B021_HayloftBarn: { extraData: { foodCount: 2 } },
    }
    const oldVisibleEvent: GameEvent = {
      schemaVersion: 1,
      id: 'old-visible',
      seq: 1,
      round: state.round,
      phase: state.roundPhase,
      type: 'card.stateChanged',
      visibility: 'public',
      cardId: 'B021_HayloftBarn',
      targetPlayerId: p2.id,
      key: 'foodCount',
      value: 1,
    }
    const hiddenEvent: GameEvent = {
      schemaVersion: 1,
      id: 'hidden',
      seq: 2,
      round: state.round,
      phase: state.roundPhase,
      type: 'card.stateChanged',
      visibility: 'public',
      cardId: 'D036_BreedRegistry',
      targetPlayerId: p2.id,
      key: 'boardSheep',
      value: 1,
    }
    const newVisibleEvent: GameEvent = {
      schemaVersion: 1,
      id: 'new-visible',
      seq: 1,
      round: state.round,
      phase: state.roundPhase,
      type: 'card.stateChanged',
      visibility: 'public',
      cardId: 'B021_HayloftBarn',
      targetPlayerId: p2.id,
      key: 'foodCount',
      value: 2,
    }
    state.events = [newVisibleEvent]
    state.nextEventSeq = 2
    state.publicEventArchive = [
      {
        schemaVersion: 1,
        id: '1',
        packetSeq: 1,
        type: 'publicEvents.committed',
        eventIds: ['old-visible', 'hidden'],
        eventSeqs: [1, 2],
        firstEventSeq: 1,
        lastEventSeq: 2,
      },
      {
        schemaVersion: 1,
        id: '2',
        packetSeq: 2,
        type: 'publicEvents.canceled',
        reason: 'undoStep',
        previousMaxSeq: 2,
        nextMaxSeq: 0,
        canceledEventIds: ['old-visible', 'hidden'],
        canceledSeqs: [1, 2],
        canceledEvents: [oldVisibleEvent, hiddenEvent],
      },
      {
        schemaVersion: 1,
        id: '3',
        packetSeq: 3,
        type: 'publicEvents.committed',
        eventIds: ['new-visible'],
        eventSeqs: [1],
        firstEventSeq: 1,
        lastEventSeq: 1,
      },
    ]
    state.nextPublicEventArchivePacketSeq = 4

    const opponentView = serializeStateForPlayer(state, 'p1', emptyCtx())

    expect(opponentView.publicEventArchive).toEqual([
      {
        schemaVersion: 1,
        id: '1',
        packetSeq: 1,
        type: 'publicEvents.committed',
        eventIds: ['old-visible'],
        eventSeqs: [2],
        firstEventSeq: 2,
        lastEventSeq: 2,
      },
      {
        schemaVersion: 1,
        id: '2',
        packetSeq: 2,
        type: 'publicEvents.canceled',
        reason: 'undoStep',
        previousMaxSeq: 2,
        nextMaxSeq: 0,
        canceledEventIds: ['old-visible'],
        canceledSeqs: [2],
        canceledEvents: [{ ...oldVisibleEvent, seq: 2 }],
      },
      {
        schemaVersion: 1,
        id: '3',
        packetSeq: 3,
        type: 'publicEvents.committed',
        eventIds: ['new-visible'],
        eventSeqs: [1],
        firstEventSeq: 1,
        lastEventSeq: 1,
      },
    ])
  })
})
