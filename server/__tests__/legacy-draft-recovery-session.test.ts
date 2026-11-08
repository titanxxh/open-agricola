import { afterEach, describe, expect, it } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { createOpeningSession } from './_helpers/session-fixtures'
import { serializeSessionSnapshot, rehydrateState } from '../../shared/session/serialization'
import { draftSeatProgress } from '../../shared/projections/draft-progress'
import { firstDraftPick } from '../../shared/draft/__tests__/draft-fixtures'
import { draftForLegacyReplay } from '../../shared/draft/legacy-draft'
import standardPartial from '../../shared/draft/__tests__/fixtures/standard-partial.json'
import standardRotated from '../../shared/draft/__tests__/fixtures/standard-rotated.json'
import moorOccupation from '../../shared/draft/__tests__/fixtures/moor-occupation.json'
import moorMinor from '../../shared/draft/__tests__/fixtures/moor-minor.json'
import moorPublished from '../../shared/draft/__tests__/fixtures/moor-published.json'

const sessions: GameSession[] = []
afterEach(() => { for (const session of sessions.splice(0)) session.dispose() })

describe('retained global-round draft recovery', () => {
  it.each([
    ['standard, one submitted seat', standardPartial],
    ['standard, rotated packets', standardRotated],
    ['Moor occupations', moorOccupation],
    ['Moor minors after occupations', moorMinor],
    ['published minors after both earlier stages', moorPublished],
  ])('publishes, continues and reconnects %s without losing confirmed choices', (_name, fixture) => {
    const source = createOpeningSession({
      seed: fixture.seed,
      options: { playerCount: 2, draftMode: 'simultaneous', draftPoolSize: fixture.options.draftPoolSize,
        enableFarmersOfTheMoor: fixture.options.enableFarmersOfTheMoor },
      expected: { phase: 'draft', roundPhase: 'work', interaction: { stateId: 'idle' } },
    })
    const session = new GameSession(42)
    sessions.push(source, session)
    const snapshot = serializeSessionSnapshot(source.state, source)
    const raw = { ...snapshot, state: { ...snapshot.state, draft: fixture.draft },
      frame: { ...snapshot.frame, draft: fixture.draft } }
    const before = JSON.stringify(raw)
    const originalKept = new Map(Object.entries(fixture.draft.kept))
    const response = session.loadState(raw)
    expect(response.ok, response.error).toBe(true)
    expect(session.buildSyncPayload(response, ['p1']).state.phase).toBe('draft')
    expect(session.buildSyncPayload(response, []).state.phase).toBe('draft')
    expect(JSON.stringify(raw)).toBe(before)
    expect(session.state.players).toEqual(raw.state.players)
    expect(session.state.log).toEqual(raw.state.log)
    expect(session.state.events).toEqual(raw.state.events)
    const recovered = session.state.draft
    if (!recovered) throw new Error('Expected retained draft')
    const archive = serializeSessionSnapshot(session.state, session)
    const legacyView = draftForLegacyReplay(recovered)
    if (!legacyView) throw new Error('Expected original Viewer projection')
    expect(archive.frame.draft).toEqual(legacyView)
    expect(legacyView.seatOrder.map(id => legacyView.kept[id])).toEqual([
      fixture.draft.kept.p1, fixture.draft.kept.p2,
    ])
    expect(legacyView.stages.map(stage => Object.keys(stage.pools))).toEqual(recovered.stages.map(() => ['p1', 'p2']))
    const privateView = session.buildSyncPayload(response, ['p1'], 'viewer', archive.frame).state.draft
    expect(privateView).not.toHaveProperty('pools')
    expect(privateView).not.toHaveProperty('kept')
    expect(privateView).not.toHaveProperty('pendingPicks')
    const ownProgress = draftSeatProgress(recovered, 'p1')
    for (const [stageIndex, stage] of (privateView?.stages ?? []).entries()) {
      expect(stage).not.toHaveProperty('pools')
      expect(stage.seats.p2.kept.occ.every(id => id === '?')).toBe(true)
      expect(stage.seats.p2.kept.minor.every(id => id === '?')).toBe(true)
      for (const packet of Object.values(stage.seats.p2.inbox)) {
        expect([...packet.occ, ...packet.minor].every(id => id === '?')).toBe(true)
      }
      for (const [round, packet] of Object.entries(stage.seats.p1.inbox)) {
        if (ownProgress.kind === 'selecting' && ownProgress.stageIndex === stageIndex && ownProgress.round === Number(round)) continue
        expect([...packet.occ, ...packet.minor].every(id => id === '?')).toBe(true)
      }
    }
    for (const playerId of ['p1', 'p2']) {
      expect(draftSeatProgress(recovered, playerId).kept).toEqual(originalKept.get(playerId))
    }
    const actor = recovered.seatOrder.find(id => draftSeatProgress(recovered, id).kind === 'selecting')
    if (!actor) throw new Error('Expected remaining manual choice')
    const choice = firstDraftPick(recovered, actor)
    expect(session.submitDraftPick(actor, choice).ok).toBe(true)
    const nextSnapshot = serializeSessionSnapshot(session.state, session)
    const reconnect = new GameSession(rehydrateState(nextSnapshot))
    sessions.push(reconnect)
    expect(serializeSessionSnapshot(reconnect.state, reconnect)).toEqual(nextSnapshot)
    const unchanged = JSON.stringify(reconnect.state.draft)
    expect(reconnect.submitDraftPick(actor, choice).ok).toBe(true)
    expect(JSON.stringify(reconnect.state.draft)).toBe(unchanged)
    for (let step = 0; reconnect.state.draft && step < 80; step++) {
      const draft = reconnect.state.draft
      const id = draft.seatOrder.find(pid => draftSeatProgress(draft, pid).kind === 'selecting')
      if (!id) throw new Error('Recovered draft deadlocked')
      expect(reconnect.submitDraftPick(id, firstDraftPick(draft, id)).ok).toBe(true)
    }
    const final = reconnect.getState()
    expect(final.state.phase).toBe('playing')
    expect(final.state.draft).toBeNull()
    for (const player of final.state.players) {
      const kept = originalKept.get(player.id)
      if (!kept) throw new Error('Expected original seated player')
      expect(player.occupationHand.slice(0, kept.occ.length)).toEqual(kept.occ)
      expect(player.minorHand.slice(0, kept.minor.length)).toEqual(kept.minor)
      expect(player.occupationHand).toHaveLength(fixture.targets.occ)
      expect(player.minorHand).toHaveLength(fixture.targets.minor)
      expect(new Set(player.occupationHand).size).toBe(fixture.targets.occ)
      expect(new Set(player.minorHand).size).toBe(fixture.targets.minor)
    }
    const originalPools = [...Object.values(fixture.draft.pools), ...Object.values(fixture.draft.kept),
      ...('stages' in fixture.draft ? fixture.draft.stages.flatMap(stage => Object.values(stage.pools)) : [])]
    for (const category of ['occ', 'minor'] as const) {
      const originals = new Set(originalPools.flatMap(cards => cards[category]))
      const kept = final.state.players.flatMap(player => category === 'occ' ? player.occupationHand : player.minorHand)
      expect(new Set(kept).size).toBe(kept.length)
      expect(kept.every(id => originals.has(id))).toBe(true)
    }
  })
})
