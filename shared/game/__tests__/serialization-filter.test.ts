import { describe, expect, it } from 'vitest'
import type { GameState } from '../../contract/types'
import type { DraftState } from '../../draft/types'
import { createInitialState } from '../../session/state-bootstrap'
import { serializeState, serializeStateForPlayer } from '../../session/serialization'
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

  it('preserves draft.kept, draft.pendingPicks, draft.round, draft.seatOrder', () => {
    const state = makeDraftState()
    const raw = serializeState(state, emptyCtx())
    const filtered = serializeStateForPlayer(state, 'p1', emptyCtx())
    expect(raw.draft).not.toBeNull()
    expect(filtered.draft).not.toBeNull()

    const r = raw.draft as DraftState
    const f = filtered.draft as DraftState
    expect(f.kept).toEqual(r.kept)
    expect(f.pendingPicks).toEqual(r.pendingPicks)
    expect(f.round).toBe(r.round)
    expect(f.totalRounds).toBe(r.totalRounds)
    expect(f.poolSize).toBe(r.poolSize)
    expect(f.seatOrder).toEqual(r.seatOrder)
    expect(f.mode).toBe(r.mode)
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
})
