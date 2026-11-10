import { readFileSync } from 'node:fs'
import { gunzipSync } from 'node:zlib'
import { afterEach, describe, expect, it } from 'vitest'
import type { InteractionState, Resource } from '../../shared/contract/types'
import { rehydrateState, serializeSessionSnapshot, type PersistedSessionSnapshot } from '../../shared/session/serialization'
import { GameSession, type SessionResponse } from '../game/authoritative-session'
import { confirmNext } from './_helpers/session-assertions'

const fixture: { producer: string; cases: Record<'own' | 'payment' | 'partner' | 'free' | 'settled', { snapshot: PersistedSessionSnapshot; interaction: InteractionState }> } = JSON.parse(
  gunzipSync(readFileSync(new URL('./fixtures/legacy-room-prices.json.gz', import.meta.url))).toString(),
)
const sessions: GameSession[] = []
const options = (response: SessionResponse) => response.interaction.stateId === 'wait' && response.interaction.request.kind === 'choice' ? response.interaction.request.options : []

function restore(name: keyof typeof fixture.cases, repeat: boolean) {
  expect(fixture.producer).toBe('f4a112409241c973c501723a6c6ac8b8537b8c85')
  let session = new GameSession(rehydrateState(structuredClone(fixture.cases[name].snapshot)))
  sessions.push(session)
  if (repeat) {
    session.getState()
    const saved = session.withCtx(() => serializeSessionSnapshot(session.state, session))
    session = new GameSession(rehydrateState(saved))
    sessions.push(session)
  }
  return session
}

function pay(session: GameSession, expected: Partial<Resource>) {
  const choice = options(session.getState()).find(option => {
    const preview = option.effectPreview
    if (preview?.kind !== 'payment') return false
    return (['wood', 'clay', 'reed', 'stone'] as const).every(resource => (preview.resourcesPaid[resource] ?? 0) === (expected[resource] ?? 0))
  })
  expect(choice).toBeDefined()
  return session.resolveChoice(0, choice!.value)
}

afterEach(() => sessions.splice(0).forEach(session => session.dispose()))

describe.each([false, true])('predecessor room cursors, repeated recovery %s', repeat => {
  it('recomputes captured self-build deltas before the next geometry command', () => {
    const session = restore('own', repeat)
    const response = session.commitSelectionChoice(0, { rooms: [{ row: 1, col: 1 }, { row: 2, col: 1 }] })
    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!).toMatchObject({ rooms: 4, resources: { wood: 0, reed: 0 } })
    expect(response.state.events).toContainEqual(expect.objectContaining({ type: 'resource.paid', resources: { wood: 4, reed: 4 } }))
  })

  it('rejects the obsolete illegal payment and offers a new legal menu that can settle', () => {
    const session = restore('payment', repeat)
    const old = fixture.cases.payment.interaction
    if (old.stateId !== 'wait' || old.request.kind !== 'choice') throw new Error('Expected predecessor payment menu')
    const invalid = old.request.options.find(option => option.effectPreview?.kind === 'payment'
      && !option.effectPreview.resourcesPaid.clay && option.effectPreview.resourcesPaid.wood === 1)
    expect(invalid).toBeDefined()
    const rejected = session.resolveChoice(0, invalid!.value)
    expect(rejected.ok).toBe(false)
    expect(rejected.state.players[0]!).toMatchObject({ rooms: 2, resources: { wood: 1, clay: 5, reed: 2 } })
    expect(rejected.interaction).toMatchObject({ stateId: 'wait', request: { kind: 'choice' } })
    expect(options(rejected).some(option => option.value === invalid!.value)).toBe(false)
    const built = pay(session, { clay: 2, wood: 1, reed: 1 })
    expect(built.ok, built.error).toBe(true)
    expect(built.state.players[0]!).toMatchObject({ rooms: 3, resources: { wood: 0, clay: 3, reed: 1 } })
    const undo = session.undoAction(0)
    expect(undo.ok, undo.error).toBe(true)
    expect(undo.state.players[0]!).toMatchObject({ rooms: 2, resources: { wood: 1, clay: 5, reed: 2 } })
  })

  it('retains the partner target while repricing and settling the selected geometry', () => {
    const session = restore('partner', repeat)
    const response = pay(session, { clay: 3, wood: 1, reed: 2 })
    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!).toMatchObject({ houseType: 'wood', rooms: 2, resources: { wood: 0, clay: 3, reed: 1 } })
    expect(response.state.players[2]!).toMatchObject({ houseType: 'clay', rooms: 3 })
    expect(response.state.events).toContainEqual(expect.objectContaining({ type: 'farm.roomBuilt', actorPlayerId: 'p1', targetPlayerId: 'p3' }))
    const undo = session.undoAction(0)
    expect(undo.ok, undo.error).toBe(true)
    expect(undo.state.players[2]!.rooms).toBe(2)
    expect(undo.state.players[0]!.resources).toMatchObject({ wood: 1, clay: 6, reed: 3 })
  })

  it('keeps a source-granted room free despite a played fixed-price card', () => {
    const session = restore('free', repeat)
    const response = session.commitSelectionChoice(0, { rooms: [{ row: 0, col: 0 }] })
    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!).toMatchObject({ houseType: 'stone', rooms: 5, resources: { wood: 0, stone: 0, reed: 0, food: 0 } })
  })

  it('does not charge a previously settled room again on handoff', () => {
    const session = restore('settled', repeat)
    const before = session.getState()
    expect(before.state.players[0]!).toMatchObject({ rooms: 3, resources: { wood: 4, reed: 2 } })
    const beforePayments = before.state.events.filter(event => event.type === 'resource.paid').length
    const next = confirmNext(session, before)
    expect(next.ok, next.error).toBe(true)
    expect(next.state.currentPlayerIndex).toBe(1)
    expect(next.state.players[0]!).toMatchObject({ rooms: 3, resources: { wood: 4, reed: 2 } })
    expect(next.state.events.filter(event => event.type === 'resource.paid')).toHaveLength(beforePayments)
  })
})
