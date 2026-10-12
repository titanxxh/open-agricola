// @vitest-environment jsdom
import { act, render, renderHook } from '@testing-library/react'
import { expect, it, vi } from 'vitest'
import { createWorkSession } from '../../../server/__tests__/_helpers/session-fixtures'
import { serializeState } from '../../../shared/session/serialization'
import { buildRoomHistoryPage, HistoryProjectionChangedError } from '../../../shared/session/history-window'
import { rehydrateStateForClient } from '../../services/rehydrate'
import { WsGameTransport } from '../../services/gameTransport'
import { buildReplayActionLogPresentation } from '../../app/replay-action-log-presentation'
import { ActionLog } from '../../components/board/ActionLog'
import { useRoomHistory } from '../useRoomHistory'

// Generic viewer-projection/cache regression, not a card ability change. A real
// two-player Session holds D036 in p2's hand; legal sheep/discard creates hidden
// bookkeeping. After 28 collection actions p1 reads all pages, then p2 legally
// plays it. Test the three streams and actual rendered history, not their shape.
const setup = () => {
  const session = createWorkSession({ seed: 10, configure: state => {
    state.players[1]!.minorHand = ['D036_BreedRegistry']
    state.players.forEach(player => { player.resources.food = 100 })
  } })
  const confirm = () => {
    let response = session.getState()
    while (response.interaction.stateId === 'wait') {
      const request = response.interaction.request
      if (request.kind === 'confirm-next-player' || request.kind === 'confirm-player-switch') {
        response = session.resolveChoice(response.interaction.playerIndex, 'confirm')
      } else if (request.kind === 'animal-reorg') {
        response = session.resolveChoice(response.interaction.playerIndex, 'confirm', { zones: [] })
      } else throw new Error(`Unexpected pending ${request.kind}`)
      expect(response.ok).toBe(true)
    }
    return response
  }
  const take = (actor: number, space: string) => {
    const response = session.takeAction(actor, space)
    expect(response.ok, response.error).toBe(true)
    expect(response.scores).toHaveLength(2)
    return response
  }
  const collect = () => {
    const response = confirm()
    const actor = response.state.currentPlayerIndex
    const available = session.getActionAvailability(actor)
    const space = ['forest', 'reed-bank', 'fishing', 'day-laborer'].find(id => available[id])!
    return take(actor, space)
  }
  take(0, 'forest'); confirm(); take(1, 'sheep-market'); confirm(); take(0, 'fishing')
  for (let index = 0; index < 25; index++) collect()
  const raw = () => session.withCtx(() => serializeState(session.state, {}))
  const props = () => {
    const payload = session.buildSyncPayload(session.getState(), 'p1', 'live', undefined, true)
    return { state: rehydrateStateForClient(payload.state), window: payload.historyWindow }
  }
  const reveal = () => {
    if (confirm().state.currentPlayerIndex === 0) { collect(); confirm() }
    const response = take(1, 'meeting-place')
    if (response.interaction.stateId !== 'wait' || response.interaction.request.kind !== 'choice') throw new Error('Expected optional improvement')
    const played = session.resolveChoice(1, response.interaction.request.options.find(option => option.value !== '__skip__')!.value)
    expect(played.ok, played.error).toBe(true)
    expect(played.state.players[1]!.minorPlayed).toContain('D036_BreedRegistry')
    expect(played.scores).toHaveLength(2)
  }
  const transport = new WsGameTransport('ws://localhost/projection-history', 'p1')
  const getHistory = vi.spyOn(transport, 'getHistory').mockImplementation(async cursor => buildRoomHistoryPage(raw(), 'p1', cursor))
  return { session, raw, props, reveal, collect, transport, getHistory }
}

it('refreshes loaded history after legal hand disclosure and renders the previously hidden trigger exactly once', async () => {
  const fixture = setup()
  try {
    const initial = fixture.props()
    expect(JSON.stringify(initial)).not.toContain('D036_BreedRegistry')
    const { result, rerender } = renderHook(props => useRoomHistory(fixture.transport, props.state, props.window), { initialProps: initial })
    await act(() => result.current.loadOlder())
    const before = fixture.session.buildSyncPayload(fixture.session.getState(), 'p1').state
    expect(result.current.events).toEqual(before.events)
    expect(result.current.canLoadOlder).toBe(false)
    const beforeRows = buildReplayActionLogPresentation({ events: before.events, publicEventArchive: before.publicEventArchive,
      stateLog: before.log, currentRound: before.round, locale: 'en', replayFilter: 'all',
      playerNames: Object.fromEntries(before.players.map(player => [player.id, player.name])),
      actionNames: Object.fromEntries(before.actionSpaces.map(space => [space.id, space.nameKey])) }).timelineBuckets.flatMap(bucket => bucket.rows)
    fixture.reveal()
    expect(() => buildRoomHistoryPage(fixture.raw(), 'p1', initial.window!.nextCursor!)).toThrow(HistoryProjectionChangedError)
    const after = fixture.props()
    expect(after.window!.branchId).toBe(initial.window!.branchId)
    await act(async () => { rerender(after) })
    const full = fixture.session.buildSyncPayload(fixture.session.getState(), 'p1').state
    expect(result.current.log).toEqual(full.log)
    expect(result.current.events).toEqual(full.events)
    expect(result.current.publicEventArchive).toEqual(full.publicEventArchive)
    expect(result.current.canLoadOlder).toBe(false)
    expect(result.current.resetNotice).toBe(false)
    const context = { currentRound: full.round, locale: 'en' as const, replayFilter: 'all' as const,
      playerNames: Object.fromEntries(full.players.map(player => [player.id, player.name])),
      actionNames: Object.fromEntries(full.actionSpaces.map(space => [space.id, space.nameKey])) }
    const actual = buildReplayActionLogPresentation({ ...context, events: result.current.events, publicEventArchive: result.current.publicEventArchive, stateLog: result.current.log })
    const expected = buildReplayActionLogPresentation({ ...context, events: full.events, publicEventArchive: full.publicEventArchive, stateLog: full.log })
    expect(actual).toEqual(expected)
    const rows = actual.timelineBuckets.flatMap(bucket => bucket.rows)
    for (const previous of beforeRows) {
      if (!previous.logEntry?.sourceEvent) continue
      const current = rows.find(row => row.logEntry?.sourceEvent?.occurrenceId === previous.logEntry!.sourceEvent!.occurrenceId)
      expect(current?.key).toBe(previous.key)
    }
    const trigger = full.events.find(event => event.type === 'card.triggered' && event.cardId === 'D036_BreedRegistry')!
    const row = expected.timelineBuckets.flatMap(bucket => bucket.rows).find(row => row.logEntry?.sourceEvent?.occurrenceId === trigger.occurrenceId)!
    const view = render(<ActionLog locale="en" log={result.current.log} currentRound={full.round} timelineBuckets={actual.timelineBuckets} />)
    expect(view.getAllByTestId(`action-log-row-${row.key}`)).toHaveLength(1)
    expect(view.container.querySelectorAll('.action-log__entry')).toHaveLength(expected.timelineBuckets.flatMap(bucket => bucket.rows).length)
  } finally { fixture.session.dispose() }
})

it('rejects an in-flight old projection and automatically replaces it with current pages', async () => {
  const fixture = setup()
  try {
    const initial = fixture.props()
    const oldPage = buildRoomHistoryPage(fixture.raw(), 'p1', initial.window!.nextCursor!)
    let resolve!: (page: typeof oldPage) => void
    fixture.getHistory.mockImplementationOnce(() => new Promise(done => { resolve = done }))
    const { result, rerender } = renderHook(props => useRoomHistory(fixture.transport, props.state, props.window), { initialProps: initial })
    let pending!: Promise<void>
    act(() => { pending = result.current.loadOlder() })
    fixture.reveal()
    await act(async () => { rerender(fixture.props()) })
    await act(async () => { resolve(oldPage); await pending })
    const full = fixture.session.buildSyncPayload(fixture.session.getState(), 'p1').state
    expect(result.current.log).toEqual(full.log)
    expect(result.current.events).toEqual(full.events)
    expect(result.current.publicEventArchive).toEqual(full.publicEventArchive)
    expect(result.current.loading).toBe(false)
    expect(result.current.canLoadOlder).toBe(false)
  } finally { fixture.session.dispose() }
})

it('refreshes the state when the server detects a projection change before its broadcast arrives', async () => {
  const fixture = setup()
  try {
    const { result, rerender } = renderHook(props => useRoomHistory(fixture.transport, props.state, props.window), { initialProps: fixture.props() })
    fixture.reveal()
    fixture.getHistory.mockRejectedValueOnce(Object.assign(new Error('projection changed'), { code: 'history_projection_changed' }))
    const getState = vi.spyOn(fixture.transport, 'getState').mockImplementation(async () => {
      rerender(fixture.props())
      return fixture.session.buildSyncPayload(fixture.session.getState(), 'p1', 'live', undefined, true)
    })
    await act(() => result.current.loadOlder())
    expect(getState).toHaveBeenCalledOnce()
    const full = fixture.session.buildSyncPayload(fixture.session.getState(), 'p1').state
    expect(result.current.log).toEqual(full.log)
    expect(result.current.events).toEqual(full.events)
    expect(result.current.publicEventArchive).toEqual(full.publicEventArchive)
    expect(result.current.error).toBe(false)
  } finally { fixture.session.dispose() }
})

it('detects changed cached prefixes while filling a reconnect gap without live-window overlap', async () => {
  const fixture = setup()
  try {
    const initial = fixture.props()
    const { result, rerender } = renderHook(props => useRoomHistory(fixture.transport, props.state, props.window), { initialProps: initial })
    await act(() => result.current.loadOlder())
    fixture.reveal()
    for (let index = 0; index < 24; index++) fixture.collect()
    const latest = fixture.props()
    expect(latest.window!.operationGroupIds.some(id => initial.window!.operationGroupIds.includes(id))).toBe(false)
    act(() => rerender(latest))
    while (result.current.canLoadOlder) await act(() => result.current.loadOlder())
    const full = fixture.session.buildSyncPayload(fixture.session.getState(), 'p1').state
    expect(result.current.log).toEqual(full.log)
    expect(result.current.events).toEqual(full.events)
    expect(result.current.publicEventArchive).toEqual(full.publicEventArchive)
  } finally { fixture.session.dispose() }
})

it('updates names without refetching an unchanged visible history prefix', async () => {
  const fixture = setup()
  try {
    const { result, rerender } = renderHook(props => useRoomHistory(fixture.transport, props.state, props.window), { initialProps: fixture.props() })
    await act(() => result.current.loadOlder())
    fixture.getHistory.mockClear()
    fixture.session.updatePlayerName(0, 'Renamed viewer')
    await act(async () => { rerender(fixture.props()) })
    expect(fixture.getHistory).not.toHaveBeenCalled()
    expect(result.current.log).toEqual(fixture.session.buildSyncPayload(fixture.session.getState(), 'p1').state.log)
  } finally { fixture.session.dispose() }
})
