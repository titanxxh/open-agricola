// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { createWorkSession } from '../../../server/__tests__/_helpers/session-fixtures'
import { serializeState } from '../../../shared/session/serialization'
import { buildRoomHistoryPage } from '../../../shared/session/history-window'
import type { RoomHistoryPage } from '../../../shared/contract/protocol/history'
import { rehydrateStateForClient } from '../../services/rehydrate'
import { WsGameTransport } from '../../services/gameTransport'
import { useRoomHistory } from '../useRoomHistory'

const setup = () => {
  const session = createWorkSession({ seed: 563, configure: state => {
    state.players.forEach(player => { player.resources.food = 100 })
  } })
  const append = (count: number) => {
    for (let index = 0; index < count; index++) {
      let response = session.getState()
      while (response.interaction.stateId === 'wait') {
        const request = response.interaction.request
        if (request.kind !== 'confirm-next-player' && request.kind !== 'confirm-player-switch') throw new Error(`Unexpected ${request.kind}`)
        response = session.resolveChoice(response.interaction.playerIndex, 'confirm')
      }
      const actor = response.state.currentPlayerIndex
      const available = session.getActionAvailability(actor)
      const space = ['forest', 'reed-bank', 'fishing', 'day-laborer'].find(id => available[id])
      if (!space) throw new Error('No collection space')
      expect(session.takeAction(actor, space).ok).toBe(true)
    }
  }
  const raw = () => session.withCtx(() => serializeState(session.state, {}))
  const props = (viewer = 'p1') => {
    const payload = session.buildSyncPayload(session.getState(), viewer, 'player', undefined, true)
    return { state: rehydrateStateForClient(payload.state), window: payload.historyWindow }
  }
  const transport = new WsGameTransport('ws://localhost/test-history', 'p1')
  const getHistory = vi.spyOn(transport, 'getHistory').mockImplementation(async cursor => buildRoomHistoryPage(raw(), 'p1', cursor))
  append(28)
  return { session, append, raw, props, transport, getHistory }
}

describe('loaded Room history', () => {
  it('returns complete HTTP/debug history without a window or render-loop cache updates', () => {
    const fixture = setup()
    try {
      const state = rehydrateStateForClient(fixture.session.buildSyncPayload(fixture.session.getState(), 'p1').state)
      const { result } = renderHook(() => useRoomHistory(fixture.transport, state, undefined))
      expect(result.current.log).toBe(state.log)
      expect(result.current.events).toBe(state.events)
      expect(result.current.canLoadOlder).toBe(false)
      expect(fixture.getHistory).not.toHaveBeenCalled()
    } finally { fixture.session.dispose() }
  })
  it('retains loaded pages and the sliding live prefix during ordinary appends', async () => {
    const fixture = setup()
    const { result, rerender } = renderHook(props => useRoomHistory(fixture.transport, props.state, props.window), { initialProps: fixture.props() })
    try {
      await act(() => result.current.loadOlder())
      const beforeIds = result.current.log.map(entry => entry.sourceEvent?.occurrenceId)
      expect(result.current.canLoadOlder).toBe(false)
      fixture.append(5)
      act(() => rerender(fixture.props()))
      expect(result.current.resetNotice).toBe(false)
      expect(result.current.canLoadOlder).toBe(false)
      expect(result.current.log.map(entry => entry.sourceEvent?.occurrenceId)).toEqual(expect.arrayContaining(beforeIds))
      const full = fixture.session.buildSyncPayload(fixture.session.getState(), 'p1').state
      expect(result.current.log).toEqual(full.log)
      expect(result.current.events).toEqual(full.events)
      expect(result.current.publicEventArchive).toEqual(full.publicEventArchive)
    } finally { fixture.session.dispose() }
  })

  it('keeps the old reading range and fills the intervening gap after missing more than a live window', async () => {
    const fixture = setup()
    const { result, rerender } = renderHook(props => useRoomHistory(fixture.transport, props.state, props.window), { initialProps: fixture.props() })
    try {
      await act(() => result.current.loadOlder())
      const oldIds = result.current.events.map(event => event.occurrenceId)
      fixture.append(24)
      act(() => rerender(fixture.props()))
      expect(result.current.events.map(event => event.occurrenceId)).toEqual(expect.arrayContaining(oldIds))
      expect(result.current.canLoadOlder).toBe(true)
      while (result.current.canLoadOlder) await act(() => result.current.loadOlder())
      const full = fixture.session.buildSyncPayload(fixture.session.getState(), 'p1').state
      expect(result.current.log).toEqual(full.log)
      expect(result.current.events).toEqual(full.events)
      expect(result.current.publicEventArchive).toEqual(full.publicEventArchive)
      expect(result.current.resetNotice).toBe(false)
    } finally { fixture.session.dispose() }
  })

  it('accepts an in-flight older page after a normal append without duplicates', async () => {
    const fixture = setup()
    let resolve!: (page: RoomHistoryPage) => void
    fixture.getHistory.mockImplementationOnce(() => new Promise(done => { resolve = done }))
    const oldProps = fixture.props()
    const page = buildRoomHistoryPage(fixture.raw(), 'p1', oldProps.window!.nextCursor!)
    const { result, rerender } = renderHook(props => useRoomHistory(fixture.transport, props.state, props.window), { initialProps: oldProps })
    try {
      let request!: Promise<void>
      act(() => { request = result.current.loadOlder() })
      fixture.append(1)
      act(() => rerender(fixture.props()))
      await act(async () => { resolve(page); await request })
      expect(result.current.resetNotice).toBe(false)
      expect(result.current.log).toEqual(fixture.session.buildSyncPayload(fixture.session.getState(), 'p1').state.log)
      expect(new Set(result.current.events.map(event => event.occurrenceId)).size).toBe(result.current.events.length)
    } finally { fixture.session.dispose() }
  })

  it('immediately discards loaded pages on undo or viewer change', async () => {
    const fixture = setup()
    const { result, rerender } = renderHook(props => useRoomHistory(fixture.transport, props.state, props.window), { initialProps: fixture.props() })
    try {
      await act(() => result.current.loadOlder())
      expect(fixture.session.undoAction().ok).toBe(true)
      const undone = fixture.props()
      act(() => rerender(undone))
      expect(result.current.log).toEqual(undone.state.log)
      expect(result.current.resetNotice).toBe(true)
      await act(() => result.current.loadOlder())
      const other = fixture.props('p2')
      act(() => rerender(other))
      expect(result.current.log).toEqual(other.state.log)
    } finally { fixture.session.dispose() }
  })

  it('rejects an in-flight page after restoration to a shorter prefix of the same append path', async () => {
    const fixture = setup()
    const earlier = fixture.raw()
    const earlierProps = fixture.props()
    fixture.append(4)
    const later = fixture.props()
    expect(later.window!.branchId).toBe(earlierProps.window!.branchId)
    let resolve!: (page: RoomHistoryPage) => void
    fixture.getHistory.mockImplementationOnce(() => new Promise(done => { resolve = done }))
    const page = buildRoomHistoryPage(fixture.raw(), 'p1', later.window!.nextCursor!)
    const { result, rerender } = renderHook(props => useRoomHistory(fixture.transport, props.state, props.window), { initialProps: later })
    try {
      let request!: Promise<void>
      act(() => { request = result.current.loadOlder() })
      fixture.session.loadState(earlier)
      const restored = fixture.props()
      expect(restored.window!.branchId).toBe(later.window!.branchId)
      act(() => rerender(restored))
      await act(async () => { resolve(page); await request })
      expect(result.current.log).toEqual(restored.state.log)
      expect(result.current.resetNotice).toBe(true)
      expect(result.current.loading).toBe(false)
    } finally { fixture.session.dispose() }
  })

  it('does not accept an old request after a viewer switches away and back', async () => {
    const fixture = setup()
    let resolve!: (page: RoomHistoryPage) => void
    fixture.getHistory.mockImplementationOnce(() => new Promise(done => { resolve = done }))
    const initial = fixture.props()
    const page = buildRoomHistoryPage(fixture.raw(), 'p1', initial.window!.nextCursor!)
    const { result, rerender } = renderHook(props => useRoomHistory(fixture.transport, props.state, props.window), { initialProps: initial })
    try {
      let request!: Promise<void>
      act(() => { request = result.current.loadOlder() })
      act(() => rerender(fixture.props('p2')))
      act(() => rerender(fixture.props()))
      await act(async () => { resolve(page); await request })
      expect(result.current.log).toEqual(initial.state.log)
      expect(result.current.loading).toBe(false)
    } finally { fixture.session.dispose() }
  })
})
