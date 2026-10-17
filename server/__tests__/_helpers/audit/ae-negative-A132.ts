// Helpers of ae-negative-A132-session.test.ts from the negative audit snapshot fafd4f51b.
import assert from 'node:assert/strict'
import type { GameSession, SessionResponse } from '../../../game/authoritative-session'
import { createWorkSession } from '../session-fixtures'

export const CARD = 'A132_Publican'
export const sessions: GameSession[] = []
export function setup({ restricted = false, grain = 1, self = false } = {}) {
  const session = createWorkSession({ seed: 132, options: { playerCount: 4 }, configure: state => {
    state.round = 14
    state.currentPlayerIndex = self ? 0 : 1
    state.players[0]!.occupationPlayed = [CARD]
    state.players[0]!.resources.grain = grain
    state.players[0]!.fields = [{ row: 0, col: 2, stacks: [] }]
    state.players[1]!.resources.grain = 1
    state.players[1]!.resources.wood = 0
    state.players[1]!.fields = [{ row: 0, col: 2, stacks: [] }, { row: 0, col: 3, stacks: [] }]
    if (restricted) {
      state.players[1]!.occupationPlayed = ['A115_ChiefForester']
      state.actionSpaces.find(space => space.id === 'forest')!.resources.wood = 3
    }
  } })
  sessions.push(session)
  return session
}
export function switches(session: GameSession, response: SessionResponse) {
  for (let i = 0; i < 4 && response.interaction.stateId === 'wait'
    && response.interaction.request.kind === 'confirm-player-switch'; i++) {
    response = session.resolveChoice(response.interaction.request.fromPlayerIndex, 'confirm')
    assert.equal(response.ok, true, response.error)
  }
  return response
}
export function accept(session: GameSession, response: SessionResponse, actor: number) {
  assert.ok(response.interaction.stateId === 'wait' && response.interaction.request.kind === 'choice')
  const option = response.interaction.request.options.find(o => o.value !== '__skip__')
  assert.ok(option)
  const accepted = session.resolveChoice(actor, option.value)
  assert.equal(accepted.ok, true, accepted.error)
  return { response: switches(session, accepted), value: option.value }
}
export function start(session: GameSession, restricted = false, actor = 1) {
  let r = session.takeAction(actor, restricted ? 'forest' : 'grain-utilization')
  assert.equal(r.ok, true, r.error)
  if (r.interaction.stateId === 'wait' && r.interaction.request.kind === 'choice' && r.interaction.request.options.some(o => o.value === 'sow')) {
    r = session.resolveChoice(actor, 'sow')
    assert.equal(r.ok, true, r.error)
  }
  return switches(session, r)
}
export function score(r: SessionResponse) {
  return r.scores?.[0]?.categories.find(c => c.key === 'cardBonusVp')?.total ?? 0
}
