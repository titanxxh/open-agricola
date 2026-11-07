import { afterEach, describe, expect, it } from 'vitest'
import { GameSession } from '../authoritative-session'
import { createOpeningSession } from '../../__tests__/_helpers/session-fixtures'
import { rehydrateState, serializeState } from '../../../shared/session/serialization'
import { firstDraftPick } from '../../../shared/draft/__tests__/draft-fixtures'
import { draftSeatProgress } from '../../../shared/projections/draft-progress'
import type { InitialStateOptions } from '../../../shared/session/state-bootstrap'
import type { DraftState } from '../../../shared/draft/types'

const sessions: GameSession[] = []
afterEach(() => { for (const session of sessions.splice(0)) session.dispose() })

function opening(options: InitialStateOptions = {}) {
  const session = createOpeningSession({
    seed: 123456,
    options: { playerCount: 2, draftMode: 'simultaneous', draftPoolSize: 7, ...options },
    expected: { phase: 'draft', roundPhase: 'work', interaction: { stateId: 'idle' } },
  })
  sessions.push(session)
  return session
}

function draftOf(session: GameSession): DraftState {
  const draft = session.getState().state.draft
  if (!draft) throw new Error('expected draft phase')
  return draft
}

function pick(session: GameSession, playerId: string) {
  return session.submitDraftPick(playerId, firstDraftPick(draftOf(session), playerId))
}

function finish(session: GameSession) {
  for (let step = 0; step < 256; step++) {
    const state = session.getState().state
    if (!state.draft) return session.getState()
    const draft = state.draft
    const playerId = draft.seatOrder.find(id => draftSeatProgress(draft, id).kind === 'selecting')
    if (!playerId) throw new Error('unfinished draft has no actionable seat')
    const response = pick(session, playerId)
    expect(response.ok, response.error).toBe(true)
  }
  throw new Error('draft did not finish')
}

const serialized = (session: GameSession) => session.withCtx(() => serializeState(session.state, {
  actionHooks: session.actionHooks, engineStack: session.getEngineStack(),
}))

describe('GameSession asynchronous draft', () => {
  it('starts a fresh two-player draft with private candidates and no ordinary hand', () => {
    const session = opening()
    const response = session.getState()
    expect(response.interaction.stateId).toBe('idle')
    expect(response.state.draft?.seatOrder).toEqual(['p1', 'p2'])
    for (const player of response.state.players) {
      const progress = draftSeatProgress(draftOf(session), player.id)
      expect(progress).toMatchObject({ kind: 'selecting', stage: 'standard', round: 1, totalRounds: 7 })
      if (progress.kind !== 'selecting') throw new Error('expected initial packet')
      expect(progress.pool.occ).toHaveLength(7)
      expect(progress.pool.minor).toHaveLength(7)
      expect(progress.kept).toEqual({ occ: [], minor: [] })
      expect(player.occupationHand).toEqual([])
      expect(player.minorHand).toEqual([])
    }
    expect(session.takeAction(0, 'forest')).toMatchObject({ ok: false, error: expect.stringMatching(/draft in progress/i) })
  })

  it('passes immediately to the next seat and keeps a waiting seat from choosing twice', () => {
    const session = opening()
    const first = firstDraftPick(draftOf(session), 'p1')
    const source = draftSeatProgress(draftOf(session), 'p1')
    if (source.kind !== 'selecting') throw new Error('expected initial packet')
    const expectedPacket = { occ: source.pool.occ.slice(1), minor: source.pool.minor.slice(1) }
    const response = session.submitDraftPick('p1', first)
    expect(response.ok).toBe(true)
    expect(draftSeatProgress(draftOf(session), 'p1')).toMatchObject({ kind: 'waiting', round: 2,
      kept: { occ: [first.occCardId], minor: [first.minorCardId] } })
    expect(draftOf(session).stages[0].seats.p2.inbox[2]).toEqual(expectedPacket)
    expect(session.submitDraftPick('p1', { ...first, opportunityKey: '0:2' }).ok).toBe(false)
    expect(pick(session, 'p2').ok).toBe(true)
    expect(draftSeatProgress(draftOf(session), 'p2')).toMatchObject({ kind: 'selecting', round: 2, pool: expectedPacket })
  })

  it('lets three seats continue to 1/2/3 picks while a fourth seat is absent, then resumes FIFO', () => {
    const session = opening({ playerCount: 4 })
    const initialA = firstDraftPick(draftOf(session), 'p1')
    const initialD = draftSeatProgress(draftOf(session), 'p4')
    if (initialD.kind !== 'selecting') throw new Error('expected initial packet')
    const expectedSecondA = { occ: initialD.pool.occ.slice(1), minor: initialD.pool.minor.slice(1) }
    for (const id of ['p2', 'p3', 'p3', 'p4', 'p4', 'p4']) expect(pick(session, id).ok).toBe(true)
    const stopped = draftOf(session)
    expect(stopped.seatOrder.map(id => draftSeatProgress(stopped, id).kept.occ.length)).toEqual([0, 1, 2, 3])
    expect(Object.keys(stopped.stages[0].seats.p1.inbox)).toEqual(['1', '2', '3', '4'])
    expect(['p2', 'p3', 'p4'].map(id => draftSeatProgress(stopped, id).kind)).toEqual(['waiting', 'waiting', 'waiting'])
    expect(session.submitDraftPick('p1', initialA).ok).toBe(true)
    expect(draftSeatProgress(draftOf(session), 'p1')).toMatchObject({ kind: 'selecting', round: 2, pool: expectedSecondA })
    expect(draftSeatProgress(draftOf(session), 'p2').kind).toBe('selecting')
    const final = finish(session)
    expect(final.state.phase).toBe('playing')
    for (const player of final.state.players) {
      expect(player.occupationHand).toHaveLength(7)
      expect(player.minorHand).toHaveLength(7)
    }
  })

  it.each([7, 8, 9, 10])('finishes a two-player pool of %i with exactly seven of each type and complete pick history', poolSize => {
    const session = opening({ draftPoolSize: poolSize })
    const response = finish(session)
    expect(response.state.phase).toBe('playing')
    expect(response.state.draft).toBeNull()
    expect(response.interaction.stateId).toBe('idle')
    for (const player of response.state.players) {
      expect(player.occupationHand).toHaveLength(7)
      expect(player.minorHand).toHaveLength(7)
      expect(player.stats.draftHistory).toHaveLength(14)
      expect(player.stats.draftHistory.filter(entry => entry.draftTurn === 7)).toHaveLength(2)
      expect(new Set(player.stats.draftHistory.map(entry => entry.cardId)).size).toBe(14)
    }
  })

  it('allows a Moor player to select the next stage while another still has occupation packets', () => {
    const session = opening({ playerCount: 4, enableFarmersOfTheMoor: true, allowIncompleteFarmersOfTheMoorMinorDeal: true })
    let transition = session.getState()
    for (let step = 0; step < 64; step++) {
      const draft = draftOf(session)
      const playerId = draft.seatOrder.find(id => {
        const progress = draftSeatProgress(draft, id)
        return progress.kind === 'selecting' && progress.stage === 'occupation'
      })
      if (!playerId) throw new Error('expected occupation choice')
      transition = pick(session, playerId)
      expect(transition.ok).toBe(true)
      if (draftOf(session).seatOrder.some(id => {
        const progress = draftSeatProgress(draftOf(session), id)
        return progress.kind === 'selecting' && progress.stage !== 'occupation'
      })) break
    }
    const draft = draftOf(session)
    const advancedId = draft.seatOrder.find(id => {
      const progress = draftSeatProgress(draft, id)
      return progress.kind === 'selecting' && progress.stage === 'farmersOfTheMoorMinor'
    })
    expect(advancedId).toBeDefined()
    expect(draft.seatOrder.some(id => {
      const progress = draftSeatProgress(draft, id)
      return progress.kind !== 'finished' && progress.stage === 'occupation'
    })).toBe(true)
    if (!advancedId) throw new Error('expected independently advanced player')
    expect(transition.privateEvents).toEqual(expect.arrayContaining([expect.objectContaining({
      type: 'private.draftUpdated', recipientPlayerId: advancedId, round: 7, advanced: false, finished: false,
    })]))
    expect(pick(session, advancedId).ok).toBe(true)
    expect(draftSeatProgress(draftOf(session), advancedId).kept.minor).toHaveLength(1)
    expect(session.state.phase).toBe('draft')
    const response = finish(session)
    expect(response.state.phase).toBe('playing')
    for (const player of response.state.players) {
      expect(player.occupationHand).toHaveLength(7)
      expect(player.minorHand).toHaveLength(7)
      expect(player.stats.draftHistory).toHaveLength(14)
    }
  })

  it('keeps hands private and reports no global completion when one player finishes first', () => {
    const session = opening({ playerCount: 4 })
    let response = session.getState()
    let finishedId: string | undefined
    for (let step = 0; step < 64; step++) {
      const draft = draftOf(session)
      const nextId = draft.seatOrder.find(id => draftSeatProgress(draft, id).kind === 'selecting')
      if (!nextId) throw new Error('expected remaining draft choice')
      response = pick(session, nextId)
      expect(response.ok).toBe(true)
      const remaining = response.state.draft
      if (!remaining) throw new Error('expected one player to finish before the whole table')
      finishedId = remaining.seatOrder.find(id => draftSeatProgress(remaining, id).kind === 'finished')
      if (finishedId) break
    }
    expect(finishedId).toBeDefined()
    expect(response.state.phase).toBe('draft')
    expect(response.privateEvents).toEqual(expect.arrayContaining([expect.objectContaining({
      type: 'private.draftUpdated', recipientPlayerId: finishedId, round: 7, advanced: false, finished: false,
    })]))
    const finishedPlayer = response.state.players.find(player => player.id === finishedId)
    expect(finishedPlayer?.occupationHand).toEqual([])
    expect(finishedPlayer?.minorHand).toEqual([])
    expect(finish(session).state.phase).toBe('playing')
  })

  it('enters parent selection only after every player completes their draft', () => {
    const session = opening({ enableParentCards: true, parentSelectionSeed: 1 })
    const response = finish(session)
    expect(response.state.phase).toBe('parent-selection')
    expect(response.state.parentSelection).not.toBeNull()
    expect(response.state.draft).toBeNull()
    for (const [index, player] of response.state.players.entries()) {
      const candidates = session.state.parentSelection?.candidates[player.id]
      if (!candidates) throw new Error('expected parent candidates')
      const mother = candidates.mother[0]
      const father = candidates.father[0]
      if (!mother || !father) throw new Error('expected both parent candidates')
      expect(session.submitParentSelection(index, { mother, father }).ok).toBe(true)
    }
    expect(session.state.phase).toBe('playing')
    expect(session.state.players.every(player => player.parentCards.mother && player.parentCards.father)).toBe(true)
  })
})

describe('draft validation and recovery', () => {
  it('rejects invalid cards, wrong opportunities, missing paired cards, and unknown players without changing state', () => {
    const session = opening()
    const valid = firstDraftPick(draftOf(session), 'p1')
    const before = structuredClone(draftOf(session))
    for (const invalid of [
      { ...valid, occCardId: 'not-a-card' },
      { ...valid, opportunityKey: '0:99' },
      { opportunityKey: valid.opportunityKey, occCardId: valid.occCardId },
    ]) {
      expect(session.submitDraftPick('p1', invalid).ok).toBe(false)
      expect(session.state.draft).toEqual(before)
    }
    expect(session.submitDraftPick('p99', valid).ok).toBe(false)
    expect(session.state.draft).toEqual(before)
  })

  it('retries the exact submitted opportunity after a new packet arrives without picking it or duplicating history', () => {
    const session = opening()
    const first = firstDraftPick(draftOf(session), 'p1')
    expect(session.submitDraftPick('p1', first).ok).toBe(true)
    expect(pick(session, 'p2').ok).toBe(true)
    const current = firstDraftPick(draftOf(session), 'p1')
    expect(current.opportunityKey).toBe('0:2')
    const before = serialized(session)
    const retry = session.submitDraftPick('p1', first)
    expect(retry.ok).toBe(true)
    expect(serialized(session)).toEqual(before)
    expect(retry.state.players[0].stats.draftHistory).toHaveLength(2)
    expect(retry.privateEvents ?? []).toEqual([])
    expect(session.submitDraftPick('p1', { ...current, opportunityKey: first.opportunityKey }).ok).toBe(false)
    expect(serialized(session)).toEqual(before)
  })

  it('returns the final manual submission on retry even after forced-card completion', () => {
    const session = opening()
    let last: ReturnType<typeof firstDraftPick> | undefined
    let lastId = ''
    while (session.state.draft) {
      const draft = draftOf(session)
      const id = draft.seatOrder.find(playerId => draftSeatProgress(draft, playerId).kind === 'selecting')
      if (!id) throw new Error('expected actionable seat')
      last = firstDraftPick(draft, id)
      lastId = id
      expect(session.submitDraftPick(id, last).ok).toBe(true)
    }
    if (!last) throw new Error('expected final manual pick')
    const before = serialized(session)
    expect(session.submitDraftPick(lastId, last).ok).toBe(true)
    expect(serialized(session)).toEqual(before)
  })

  it('restores accumulated packets and the latest receipt before continuing to completion', () => {
    const original = opening({ playerCount: 4 })
    let last = firstDraftPick(draftOf(original), 'p4')
    for (const id of ['p2', 'p3', 'p3', 'p4', 'p4', 'p4']) {
      last = firstDraftPick(draftOf(original), id)
      expect(original.submitDraftPick(id, last).ok).toBe(true)
    }
    const before = structuredClone(draftOf(original))
    const restored = new GameSession(rehydrateState(JSON.parse(JSON.stringify(serialized(original)))))
    sessions.push(restored)
    expect(restored.state.phase).toBe('draft')
    expect(restored.state.draft).toEqual(before)
    expect(restored.submitDraftPick('p4', last).ok).toBe(true)
    expect(restored.state.draft).toEqual(before)
    expect(restored.state.players[3].stats.draftHistory).toHaveLength(6)
    const response = finish(restored)
    expect(response.state.phase).toBe('playing')
    for (const player of response.state.players) {
      expect(player.occupationHand).toHaveLength(7)
      expect(player.minorHand).toHaveLength(7)
      expect(player.stats.draftHistory).toHaveLength(14)
    }
  })
})
