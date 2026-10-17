// Helpers of ae-negative-13-collect-session.test.ts from the negative audit snapshot fafd4f51b.
import assert from 'node:assert/strict'
import fs from '../audit-evidence-fs'
import type { GameSession, SessionResponse } from '../../../game/authoritative-session'
import type { GameState } from '../../../../shared/contract/types'
import { createWorkSession } from '../session-fixtures'
import { confirmNext } from '../negative-rule-audit'

// Design: fresh two-player sessions, real collect and turn transitions. No
// placement history is injected. Controlled initial piles are not opening history.
export const CATCH = 'A107_Catcher', MUSH = 'A108_MushroomCollector'
export const sessions: GameSession[] = []
export const output = process.env.AGRICOLA_NEGATIVE_ARTIFACT_DIR ?? 'output/ae-negative/13-collect-probes'
export function save(id: string, value: unknown) { fs.mkdirSync(output, { recursive: true }); fs.writeFileSync(`${output}/${id}.json`, JSON.stringify(value, null, 2)) }
export function ok(response: SessionResponse) { assert.equal(response.ok, true, response.error); return response }
export function setup(card: string, configure: (state: GameState) => void = () => {}, played = true) {
  const session = createWorkSession({ seed: 4242, configure(state) {
    state.round = 5
    for (const player of state.players) Object.assign(player.resources, { food: 40, wood: 0, clay: 0, reed: 0, stone: 0, grain: 0, vegetable: 0 })
    state.players[0]!.occupationPlayed = played ? [card] : []
    state.players[0]!.occupationHand = played ? ['__test_placeholder__'] : [card]
    configure(state)
  } }); sessions.push(session); return session
}
export function ready(session: GameSession, actor: number) {
  let response = session.getState()
  if (response.interaction.stateId === 'wait' && response.interaction.request.kind === 'confirm-next-player') response = confirmNext(session, response)
  assert.equal(response.interaction.stateId, 'idle', JSON.stringify(response.interaction)); assert.equal(response.state.currentPlayerIndex, actor)
}
export function turn(session: GameSession, actor: number, space: string) { ready(session, actor); return ok(session.takeAction(actor, space)) }
export function choice(response: SessionResponse) {
  assert.ok(response.interaction.stateId === 'wait' && response.interaction.request.kind === 'choice', JSON.stringify(response.interaction))
  return response.interaction.request.options
}
export function accept(session: GameSession, response: SessionResponse) {
  const option = choice(response).find(o => o.sourceCard === MUSH && o.value !== '__skip__')
  assert.ok(option, JSON.stringify(response.interaction)); return ok(session.resolveChoice(0, option.value))
}
