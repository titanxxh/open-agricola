import { installOfficialCardRegistry } from '../../cards/__tests__/card-environment'

installOfficialCardRegistry()

import { describe, expect, it } from 'vitest'
import type { GameEvent } from '../../contract/events'
import type { GameState } from '../../contract/types'
import { initStagedDraftState, processSubmit } from '../../draft/draft-manager'
import { firstDraftPick } from '../../draft/__tests__/draft-fixtures'
import { draftSeatProgress } from '../../projections/draft-progress'
import { createInitialState } from '../state-bootstrap'
import {
  filterSerializedStateForPlayer,
  rehydrateState,
  serializeState,
  serializeStateForPlayer,
} from '../serialization'
import { EngineStack } from '../../engine'

const withoutInternalValue = (event: GameEvent): GameEvent => {
  const copy = { ...event }
  if (copy.type === 'card.stateChanged') delete copy.value
  return copy
}

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
  expect(state.draft!.stages[0].seats.p1.inbox[1].occ).toHaveLength(7)
  expect(state.draft!.stages[0].seats.p1.inbox[1].minor).toHaveLength(7)
  expect(state.draft!.stages[0].seats.p2.inbox[1].occ).toHaveLength(7)
  expect(state.draft!.stages[0].seats.p2.inbox[1].minor).toHaveLength(7)
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

  it('preserves the current owner packet and masks the other seat packet', () => {
    const state = makeDraftState()
    const raw = state.draft!.stages[0].seats
    const out = serializeStateForPlayer(state, 'p1', emptyCtx()).draft!
    expect(out.stages[0].seats.p1.inbox[1]).toEqual(raw.p1.inbox[1])
    expect(out.stages[0].seats.p2.inbox[1]).toEqual({
      occ: Array(7).fill('?'), minor: Array(7).fill('?'),
    })
  })

  it('hides queued packets even from their owner while preserving the current packet', () => {
    const state = createInitialState(1337, { playerCount: 4, draftMode: 'simultaneous', draftPoolSize: 7 })
    for (const id of ['p2', 'p3', 'p4', 'p3', 'p4', 'p4']) {
      const result = processSubmit(state.draft!, id, firstDraftPick(state.draft!, id))
      if (result.kind !== 'accepted') throw new Error(result.error)
      state.draft = result.draft
    }
    const current = state.draft!.stages[0].seats.p1.inbox[1]
    const owner = serializeStateForPlayer(state, 'p1', emptyCtx()).draft!
    expect(owner.stages[0].seats.p1.inbox[1]).toEqual(current)
    expect(owner.stages[0].seats.p1.inbox[2]).toEqual({ occ: Array(6).fill('?'), minor: Array(6).fill('?') })
    expect(owner.stages[0].seats.p1.inbox[3]).toEqual({ occ: Array(5).fill('?'), minor: Array(5).fill('?') })
    expect(owner.stages[0].seats.p1.inbox[4]).toEqual({ occ: Array(4).fill('?'), minor: Array(4).fill('?') })
    expect(draftSeatProgress(owner, 'p1').kind).toBe('selecting')
    const spectator = serializeStateForPlayer(state, null, emptyCtx()).draft!
    expect(spectator.stages[0].seats.p1.inbox[1]).toEqual({ occ: Array(7).fill('?'), minor: Array(7).fill('?') })
  })

  it('hides unopened stages from the owner and reveals only their personal current stage', () => {
    const state = makeDraftState()
    state.draft = initStagedDraftState(['p1', 'p2'], [
      { kind: 'occupation', poolSize: 3, totalRounds: 2, pools: {
        p1: { occ: ['a1', 'a2', 'a3'], minor: [] }, p2: { occ: ['b1', 'b2', 'b3'], minor: [] },
      } },
      { kind: 'farmersOfTheMoorMinor', poolSize: 3, totalRounds: 2, pools: {
        p1: { occ: [], minor: ['f1', 'f2', 'f3'] }, p2: { occ: [], minor: ['g1', 'g2', 'g3'] },
      } },
    ])
    const opening = serializeStateForPlayer(state, 'p1', emptyCtx()).draft!
    expect(opening.stages[0].seats.p1.inbox[1].occ).toEqual(['a1', 'a2', 'a3'])
    expect(opening.stages[1].seats.p1.inbox[1].minor).toEqual(['?', '?', '?'])
    expect(opening.stages[1].seats.p2.inbox[1].minor).toEqual(['?', '?', '?'])
    for (const id of ['p1', 'p2', 'p1']) {
      const result = processSubmit(state.draft, id, firstDraftPick(state.draft, id))
      if (result.kind !== 'accepted') throw new Error(result.error)
      state.draft = result.draft
    }
    const owner = serializeStateForPlayer(state, 'p1', emptyCtx()).draft!
    expect(owner.stages[1].seats.p1.inbox[1].minor).toEqual(['f1', 'f2', 'f3'])
    expect(owner.stages[1].seats.p2.inbox[1].minor).toEqual(['?', '?', '?'])
    expect(owner.stages[0].seats.p2.inbox[2].occ).toEqual(['?', '?'])
    expect(draftSeatProgress(owner, 'p1')).toMatchObject({ stageIndex: 1, kind: 'selecting' })
    expect(draftSeatProgress(owner, 'p2')).toMatchObject({ stageIndex: 0, kind: 'selecting' })
  })

  it('keeps public pick counts while hiding other seats history and every last submission', () => {
    const state = makeDraftState()
    for (const id of ['p1', 'p2']) {
      const pick = firstDraftPick(state.draft!, id)
      const result = processSubmit(state.draft!, id, pick)
      if (result.kind !== 'accepted') throw new Error(result.error)
      state.draft = result.draft
      const player = state.players.find(player => player.id === id)!
      player.lastDraftSubmission = pick
      player.stats.draftHistory = [{ cardId: pick.occCardId!, draftTurn: 1 }]
    }
    const raw = serializeState(state, emptyCtx())
    for (const viewer of ['p1', 'p2', null]) {
      const projected = serializeStateForPlayer(state, viewer, emptyCtx())
      for (const [index, player] of state.players.entries()) {
        const own = player.id === viewer
        const actual = state.draft!.stages[0].seats[player.id].kept
        expect(projected.draft!.stages[0].seats[player.id].kept).toEqual(own ? actual : { occ: ['?'], minor: ['?'] })
        expect(projected.players[index].stats.draftHistory).toEqual([
          { cardId: own ? player.lastDraftSubmission!.occCardId : '?', draftTurn: 1 },
        ])
        expect(projected.players[index].lastDraftSubmission).toBeUndefined()
        expect(raw.players[index].lastDraftSubmission).toEqual(player.lastDraftSubmission)
      }
      expect(projected.draft!.seatOrder).toEqual(['p1', 'p2'])
      expect(projected.draft!.stages[0]).toMatchObject({ kind: 'standard', poolSize: 7, totalRounds: 7 })
    }
  })

  it('viewerPlayerId=null → all hands + pools masked (spectator mode)', () => {
    const state = makeDraftState()
    const out = serializeStateForPlayer(state, null, emptyCtx())
    for (const p of out.players) {
      expect(p.occupationHand.every((c) => c === '?')).toBe(true)
      expect(p.minorHand.every((c) => c === '?')).toBe(true)
    }
    expect(out.draft).not.toBeNull()
    for (const pool of Object.values(out.draft!.stages[0].seats).flatMap(seat => Object.values(seat.inbox))) {
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
    for (const pool of Object.values(out.draft!.stages[0].seats).flatMap(seat => Object.values(seat.inbox))) {
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

  it('masks card state, draft history, and events for hidden opponent cards', () => {
    const state = makePlayingState()
    const p2 = state.players[1]!
    p2.minorHand = ['D036_BreedRegistry']
    p2.minorPlayed = ['B021_HayloftBarn']
    p2.stats.draftHistory = [
      { cardId: 'D036_BreedRegistry', draftTurn: 1 },
      { cardId: 'B021_HayloftBarn', draftTurn: 2, playedTurn: 3 },
    ]
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
    expect(filteredP2.stats.draftHistory).toEqual([
      { cardId: '?', draftTurn: 1 },
      { cardId: 'B021_HayloftBarn', draftTurn: 2, playedTurn: 3 },
    ])
    expect(ownerP2.stats.draftHistory).toEqual(p2.stats.draftHistory)
    expect(filteredP2.cardStates.D036_BreedRegistry).toBeUndefined()
    expect(filteredP2.cardStates.B021_HayloftBarn).toBeUndefined()
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
        canceledEvents: [{ ...withoutInternalValue(visibleEvent), seq: 1 }],
      },
    ])
    expect(ownerP2.cardStates.D036_BreedRegistry).toBeUndefined()
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

    expect(opponentView.events).toEqual([withoutInternalValue(visibleEvent)])
    expect(opponentView.events[0]).not.toHaveProperty('value')
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
        canceledEvents: [{ ...withoutInternalValue(oldVisibleEvent), seq: 2 }],
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
