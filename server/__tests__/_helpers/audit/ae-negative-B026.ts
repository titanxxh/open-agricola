// Helpers of ae-negative-B026-session.test.ts from the negative audit snapshot fafd4f51b.
import assert from 'node:assert/strict'
import type { GameSession, SessionResponse } from '../../../game/authoritative-session'
import { createWorkSession } from '../session-fixtures'

export const CARD = 'B026_AgrarianFences'
export const EDGES = ['H-2-4', 'H-3-4', 'V-2-4', 'V-2-5']
export const sessions: GameSession[] = []
export function setup(wood = 8) {
  const session = createWorkSession({ seed: 26, configure: state => {
    state.round = 14
    const p = state.players[0]!
    p.minorPlayed = [CARD]
    p.improvements = ['Major_Fireplace1']
    p.resources = { ...p.resources, wood, grain: 2, food: 0, vegetable: 0 }
    p.fields = [{ row: 0, col: 2, stacks: [] }]
  } })
  sessions.push(session)
  return session
}
export function choose(session: GameSession, label: string) {
  const r = session.getState()
  assert.ok(r.interaction.stateId === 'wait' && r.interaction.request.kind === 'choice')
  const o = r.interaction.request.options?.find(o => o.labelKey === label || o.labelParams?.actionNameKey === label || o.sourceCard === label)
  assert.ok(o, label)
  const selected = session.resolveChoice(0, o.value)
  assert.equal(selected.ok, true, selected.error)
  return selected
}
export function offered(session: GameSession, label: string) {
  const { interaction } = session.getState()
  return interaction.stateId === 'wait' && interaction.request.kind === 'choice'
    && interaction.request.options.some(o => o.labelKey === label || o.labelParams?.actionNameKey === label || o.sourceCard === label || o.value === label)
}
export function fenceThenSow(session: GameSession) {
  assert.equal(session.takeAction(0, 'grain-utilization').ok, true)
  choose(session, CARD)
  const replacement = choose(session, 'ui.interactionAgrarianFencesSowAndFence')
  if (replacement.interaction.stateId !== 'wait' || replacement.interaction.request.kind !== 'farm-select'
    || replacement.interaction.request.farm.farmType !== 'fence') choose(session, 'actions.fencing.name')
  const fenced = session.commitSelectionChoice(0, { edges: EDGES, palisadeEdges: [] })
  assert.equal(fenced.ok, true, fenced.error)
  assert.equal(fenced.state.players[0]!.fenceSegments.length, 4)
  if (offered(session, 'ui.interactionDoNotReplace')) choose(session, 'ui.interactionDoNotReplace')
  if (offered(session, 'actions.sow.name')) choose(session, 'actions.sow.name')
  const current = session.getState()
  if (current.interaction.stateId === 'wait' && current.interaction.request.kind === 'farm-select'
    && current.interaction.request.farm.farmType === 'sow') {
    const sown = session.commitSelectionChoice(0, { crops: [{ row: 0, col: 2, crop: 'grain' }] })
    assert.equal(sown.ok, true, sown.error)
    assert.deepEqual(sown.state.players[0]!.fields[0]!.stacks, [{ kind: 'grain', remaining: 3 }])
  }
  return session.getState()
}
export function totals(r: SessionResponse) {
  const p = r.state.players[0]!
  return { wood: p.resources.wood, grain: p.resources.grain, food: p.resources.food, fences: p.fenceSegments.length }
}
