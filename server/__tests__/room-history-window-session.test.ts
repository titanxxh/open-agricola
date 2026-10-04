import { describe, expect, it } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { JsonRoomPersistence } from '../game/persistence/json-adapter'
import { InMemoryRoomPersistence } from '../game/persistence/memory-adapter'
import type { GameEvent } from '../../shared/contract/events'
import { GameSession } from '../game/authoritative-session'
import { rehydrateState, serializeSessionSnapshot, serializeState } from '../../shared/session/serialization'
import { buildRoomHistoryPage, describeHistory, HISTORY_WINDOW_GROUPS, HistoryBranchChangedError } from '../../shared/session/history-window'
import { frameHash, type JsonValue } from '../game/replay-codec'

const setup = () => {
  const session = new GameSession(563, undefined, { playerCount: 2 })
  for (const player of session.state.players) {
    player.minorHand = ['__test_placeholder__']
    player.occupationHand = ['__test_placeholder__']
    player.resources.food = 100
  }
  session.loadState(session.state)
  return session
}
const addActions = (session: GameSession, count: number) => {
  for (let index = 0; index < count; index++) {
    let response = session.getState()
    while (response.interaction.stateId === 'wait') {
      const request = response.interaction.request
      if (request.kind !== 'confirm-next-player' && request.kind !== 'confirm-player-switch') throw new Error(`Unexpected ${request.kind}`)
      response = session.resolveChoice(request.kind === 'confirm-next-player' ? request.nextPlayerIndex : request.fromPlayerIndex, 'confirm')
    }
    const actor = response.state.currentPlayerIndex
    const available = session.getActionAvailability(actor)
    const space = ['forest', 'reed-bank', 'fishing', 'day-laborer'].find(id => available[id])
    if (!space) throw new Error('No collection action available')
    expect(session.takeAction(actor, space).ok).toBe(true)
  }
}

describe('complete operation-group Room history pages', () => {
  it('pages every log, event and cancellation exactly once without changing the raw Frame or cursor', () => {
    const session = setup()
    addActions(session, 28)
    const canonical = session.withCtx(() => serializeState(session.state, {}))
    const beforeHash = frameHash(canonical as unknown as JsonValue)
    const beforeCursor = session.createSessionPrivateCursor()
    const full = session.buildSyncPayload(session.getState(), 'p1').state
    const pages = [buildRoomHistoryPage(canonical, 'p1')]
    expect(pages[0]!.window.operationGroupIds).toHaveLength(HISTORY_WINDOW_GROUPS)
    while (pages.at(-1)!.window.nextCursor) pages.push(buildRoomHistoryPage(canonical, 'p1', pages.at(-1)!.window.nextCursor!))
    expect(pages.flatMap(page => page.log)).toEqual(full.log)
    expect(pages.toReversed().flatMap(page => page.events)).toEqual(full.events)
    expect(pages.toReversed().flatMap(page => page.publicEventArchive)).toEqual(full.publicEventArchive)
    for (const field of ['logRecords', 'eventRecords', 'archiveRecords'] as const) {
      const ids = pages.flatMap(page => page.window[field].map(record => record.recordId))
      expect(new Set(ids).size).toBe(ids.length)
    }
    expect(frameHash(canonical as unknown as JsonValue)).toBe(beforeHash)
    expect(session.createSessionPrivateCursor()).toEqual(beforeCursor)
  })

  it('projects both participant roles after rename while retaining raw parameter versions and rejecting stale branches', () => {
    const session = setup()
    session.state.players.forEach(player => { player.name = 'Same' })
    session.state.log = [{ key: 'transfer', params: { fromPlayer: 'Same', fromPlayerId: 'p1', toPlayer: 'Same', toPlayerId: 'p2' } }]
    const raw = session.withCtx(() => serializeState(session.state, {}))
    const branch = describeHistory(raw).branchId
    session.updatePlayerName(0, 'Left')
    session.updatePlayerName(1, 'Right')
    const current = session.withCtx(() => serializeState(session.state, {}))
    expect(buildRoomHistoryPage(current, 'p1').log[0]).toMatchObject({ params: { fromPlayer: 'Left', toPlayer: 'Right' } })
    expect(session.state.log[0]).toMatchObject({ params: { fromPlayer: 'Same', toPlayer: 'Same' } })
    expect(describeHistory(current).branchId).toBe(branch)
    addActions(session, 1)
    expect(() => buildRoomHistoryPage(session.withCtx(() => serializeState(session.state, {})), 'p1', JSON.stringify({ branchId: branch, beforeGroup: 'old' }))).toThrow(HistoryBranchChangedError)
  })
  it('filters hidden canceled events before paging and binds cursors to the viewer', () => {
    const session = setup()
    addActions(session, 28)
    const owner = session.state.players[0]!
    owner.minorHand = ['D036_BreedRegistry']
    const hidden: GameEvent = { schemaVersion: 1, id: 'hidden-card', seq: 200, round: 1, phase: session.state.roundPhase,
      type: 'card.triggered', visibility: 'public', actorPlayerId: owner.id, cardId: 'D036_BreedRegistry' }
    const visible: GameEvent = { schemaVersion: 1, id: 'visible-gain', seq: 201, round: 1, phase: session.state.roundPhase,
      type: 'resource.moved', visibility: 'public', actorPlayerId: owner.id, resources: { wood: 1 },
      from: { kind: 'supply' }, to: { kind: 'player', playerId: owner.id }, reason: 'gain' }
    session.state.log = [{ key: 'card', params: { card: 'D036_BreedRegistry' } }, ...session.state.log]
    session.state.publicEventArchive = [...session.state.publicEventArchive, {
      schemaVersion: 1, id: 'cancel-hidden', packetSeq: 200, type: 'publicEvents.canceled', reason: 'undoStep',
      previousMaxSeq: 201, nextMaxSeq: 199, canceledEventIds: [hidden.id, visible.id], canceledSeqs: [200, 201], canceledEvents: [hidden, visible],
    }]
    const raw = session.withCtx(() => serializeState(session.state, {}))
    const ownerPage = buildRoomHistoryPage(raw, 'p1')
    const other = buildRoomHistoryPage(raw, 'p2')
    expect(JSON.stringify(other)).not.toContain('D036_BreedRegistry')
    expect(JSON.stringify(other)).not.toContain('hidden-card')
    expect(JSON.stringify(other)).toContain('visible-gain')
    expect(other).not.toHaveProperty('privateEvents')
    expect(() => buildRoomHistoryPage(raw, 'p2', ownerPage.window.nextCursor!)).toThrow(HistoryBranchChangedError)
    expect(ownerPage.publicEventArchive.at(-1)).toMatchObject({ canceledEvents: [hidden, visible] })
  })

  it('rejects old pagination after undo, retains cancellation payloads and distinguishes reused sequence numbers', () => {
    const session = setup()
    addActions(session, 28)
    const raw = session.withCtx(() => serializeState(session.state, {}))
    const before = buildRoomHistoryPage(raw, 'p1')
    expect(session.undoAction().ok).toBe(true)
    const undone = session.withCtx(() => serializeState(session.state, {}))
    expect(() => buildRoomHistoryPage(undone, 'p1', before.window.nextCursor!)).toThrow(HistoryBranchChangedError)
    expect(buildRoomHistoryPage(undone, 'p1').publicEventArchive.some(packet => packet.type === 'publicEvents.canceled')).toBe(true)
    addActions(session, 1)
    const replaced = session.withCtx(() => serializeState(session.state, {}))
    const pages = [buildRoomHistoryPage(replaced, 'p1')]
    while (pages.at(-1)!.window.nextCursor) pages.push(buildRoomHistoryPage(replaced, 'p1', pages.at(-1)!.window.nextCursor!))
    expect(pages.toReversed().flatMap(page => page.publicEventArchive)).toEqual(session.buildSyncPayload(session.getState(), 'p1').state.publicEventArchive)
    const ids = pages.flatMap(page => page.window.archiveRecords.map(record => record.recordId))
    expect(new Set(ids).size).toBe(ids.length)
  })

  it.each(['json', 'memory'])('retains groups, exact raw values and renamed participant roles through %s recovery', (adapter) => {
    const dir = mkdtempSync(join(tmpdir(), 'oa-history-page-'))
    try {
      const persistence = adapter === 'json' ? new JsonRoomPersistence(dir) : new InMemoryRoomPersistence()
      const session = setup()
      addActions(session, 28)
      const [left, right] = session.state.players
      session.state.log = [{ key: 'transfer', params: { fromPlayer: left!.name, toPlayer: right!.name } }, ...session.state.log]
      serializeSessionSnapshot(session.state, session) // capture roles before names change
      session.updatePlayerName(0, 'Renamed left')
      session.updatePlayerName(1, 'Renamed right')
      const saved = serializeSessionSnapshot(session.state, session)
      const before = buildRoomHistoryPage(saved.frame, 'p1')
      persistence.save('page-room', saved, { createdBy: null, maxPlayers: 2, status: 'playing', players: [], customCardDbIds: [] })
      const loaded = persistence.load('page-room')!.serialized!
      expect(frameHash(loaded.frame as unknown as JsonValue)).toBe(frameHash(saved.frame as unknown as JsonValue))
      const restarted = new GameSession(rehydrateState(loaded))
      const raw = restarted.withCtx(() => serializeState(restarted.state, {}))
      const page = buildRoomHistoryPage(raw, 'p1')
      expect(page.window).toEqual(before.window)
      expect(page.log[0]).toMatchObject({ params: { fromPlayer: 'Renamed left', toPlayer: 'Renamed right' } })
      expect(page.window.operationGroupIds).toHaveLength(20)
      expect(page.window.nextCursor).toBeTruthy()
      expect(restarted.state.log[0]).toEqual(saved.state.log[0])
      const older = buildRoomHistoryPage(raw, 'p1', page.window.nextCursor!)
      expect(page.log.length + older.log.length).toBe(raw.log.length)
    } finally { rmSync(dir, { recursive: true, force: true }) }
  })

})
