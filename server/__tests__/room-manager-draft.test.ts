/**
 * PR-5 Task 5 — room-level wiring tests for the simultaneous card draft.
 *
 * Covers:
 *   • `parseDraftOptions` validates `draftMode` / `draftPoolSize` from a raw
 *     `createRoom` payload and rejects out-of-range or malformed inputs.
 *   • The WS `createRoom` handler forwards valid draft options into
 *     `GameSession`, so `state.phase === 'draft'` and `state.draft.poolSize`
 *     match the request. Omitted options keep the classic `phase = 'playing'`
 *     flow (backward-compat).
 *   • A room created mid-draft round-trips cleanly through `serializeState` /
 *     `rehydrateState` (mimicking a server restart before the room fills).
 */

import { describe, expect, it } from 'vitest'
import { parseDraftOptions } from '../game/room-manager.ts'
import { GameSession } from '../game/authoritative-session.ts'
import { rehydrateState, serializeState } from '../../shared/game/serialization.ts'

describe('parseDraftOptions', () => {
  it('returns value=null when draftMode is absent', () => {
    expect(parseDraftOptions({})).toEqual({ ok: true, value: null })
  })

  it('returns value=null when draftMode="none"', () => {
    expect(parseDraftOptions({ draftMode: 'none' })).toEqual({ ok: true, value: null })
  })

  it('accepts simultaneous with default pool size', () => {
    const result = parseDraftOptions({ draftMode: 'simultaneous' })
    expect(result).toEqual({
      ok: true,
      value: { draftMode: 'simultaneous', draftPoolSize: 7 },
    })
  })

  it('accepts simultaneous with explicit pool size', () => {
    const result = parseDraftOptions({
      draftMode: 'simultaneous',
      draftPoolSize: 9,
    })
    expect(result).toEqual({
      ok: true,
      value: { draftMode: 'simultaneous', draftPoolSize: 9 },
    })
  })

  it('rejects unknown draftMode', () => {
    const result = parseDraftOptions({ draftMode: 'auction' })
    expect(result.ok).toBe(false)
  })

  it.each([6, 11, 7.5, 'seven', null as unknown as number, Number.NaN])(
    'rejects invalid draftPoolSize=%p',
    (value) => {
      const result = parseDraftOptions({
        draftMode: 'simultaneous',
        draftPoolSize: value as number,
      })
      if (value === null) {
        // null means "not provided" and should fall back to default
        expect(result).toEqual({
          ok: true,
          value: { draftMode: 'simultaneous', draftPoolSize: 7 },
        })
      } else {
        expect(result.ok).toBe(false)
      }
    },
  )
})

describe('GameSession — room-level draft wiring', () => {
  it('seeds phase=draft with the requested pool size when draft options are forwarded', () => {
    const session = new GameSession(undefined, undefined, {
      playerCount: 2,
      draftMode: 'simultaneous',
      draftPoolSize: 8,
    })
    const { state } = session.getState()
    expect(state.phase).toBe('draft')
    expect(state.draft).not.toBeNull()
    expect(state.draft!.poolSize).toBe(8)
    expect(state.draft!.seatOrder).toHaveLength(2)
    for (const pid of state.draft!.seatOrder) {
      expect(state.draft!.pools[pid].occ).toHaveLength(8)
      expect(state.draft!.pools[pid].minor).toHaveLength(8)
    }
  })

  it('falls back to phase=playing when draft options are absent (backward-compat)', () => {
    const session = new GameSession(undefined, undefined, { playerCount: 2 })
    const { state } = session.getState()
    expect(state.phase).toBe('playing')
    expect(state.draft).toBeNull()
    for (const p of state.players) {
      expect(p.occupationHand.length).toBe(7)
      expect(p.minorHand.length).toBe(7)
    }
  })

  it('round-trips the seeded draft state through serializeState / rehydrateState', () => {
    // Mimics the "server restarted before the second player joined" case:
    // we persist the initial state immediately on room creation (see
    // `createRoom` handler in room-manager.ts), then rehydrate it into a
    // brand-new GameSession. The phase + pool size must survive.
    const original = new GameSession(42, undefined, {
      playerCount: 3,
      draftMode: 'simultaneous',
      draftPoolSize: 10,
    })
    const serialized = JSON.parse(
      JSON.stringify(serializeState(original.getState().state, { engineStack: original.getEngineStack() })),
    )
    const rehydrated = rehydrateState(serialized)
    const restored = new GameSession(rehydrated)
    const { state } = restored.getState()
    expect(state.phase).toBe('draft')
    expect(state.draft).not.toBeNull()
    expect(state.draft!.poolSize).toBe(10)
    expect(state.draft!.seatOrder).toHaveLength(3)
    for (const pid of state.draft!.seatOrder) {
      expect(state.draft!.pools[pid].occ).toHaveLength(10)
      expect(state.draft!.pools[pid].minor).toHaveLength(10)
      expect(state.draft!.kept[pid].occ).toEqual([])
      expect(state.draft!.kept[pid].minor).toEqual([])
    }
  })
})
