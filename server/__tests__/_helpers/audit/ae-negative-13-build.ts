// Helpers of ae-negative-13-build-session.test.ts from the negative audit snapshot fafd4f51b.
import assert from 'node:assert/strict'
import fs from '../audit-evidence-fs'
import type { GameSession, SessionResponse } from '../../../game/authoritative-session'
import type { GameState } from '../../../../shared/contract/types'
import { createWorkSession } from '../session-fixtures'
import { confirmNext } from '../negative-rule-audit'

export const ROUGH = 'A110_Roughcaster', WALL = 'A111_WallBuilder'
export const sessions: GameSession[] = []
export const output = process.env.AGRICOLA_NEGATIVE_ARTIFACT_DIR ?? 'output/ae-negative/13-build-probes'
export function save(id: string, value: unknown) { fs.mkdirSync(output, { recursive: true }); fs.writeFileSync(`${output}/${id}.json`, JSON.stringify(value, null, 2)) }
export function ok(r: SessionResponse) { assert.equal(r.ok, true, r.error); return r }
export function setup(card: string, configure: (state: GameState) => void = () => {}, played = true, round = 5) {
  const session = createWorkSession({ seed: 4242, configure(state) {
    state.round = round
    for (const player of state.players) Object.assign(player.resources, { food: 40, wood: 10, clay: 10, reed: 4, stone: 10, grain: 0, vegetable: 0 })
    state.players[0]!.occupationPlayed = played ? [card] : []; state.players[0]!.occupationHand = played ? ['__test_placeholder__'] : [card]; configure(state)
  } }); sessions.push(session); return session
}
export function ready(session: GameSession, actor: number) {
  let r = session.getState(); if (r.interaction.stateId === 'wait' && r.interaction.request.kind === 'confirm-next-player') r = confirmNext(session, r)
  assert.equal(r.interaction.stateId, 'idle', JSON.stringify(r.interaction)); assert.equal(r.state.currentPlayerIndex, actor)
}
export function turn(session: GameSession, actor: number, space: string) { ready(session, actor); return ok(session.takeAction(actor, space)) }
export function build(session: GameSession, count: number, actor = 0, stable = false) {
  let r = turn(session, actor, 'farm-expansion')
  if (r.interaction.stateId === 'wait' && r.interaction.request.kind === 'choice') {
    const option = r.interaction.request.options.find(o => o.labelKey === (stable ? 'actions.stables.name' : 'actions.construct.name')); assert.ok(option); r = ok(session.resolveChoice(actor, option.value))
  }
  assert.ok(r.interaction.stateId === 'wait' && r.interaction.request.kind === 'farm-select');
  let completed = ok(session.commitSelectionChoice(actor, stable ? { stables: [{ row: 0, col: 1 }] } : { rooms: Array.from({ length: count }, (_, i) => ({ row: i+1, col: 1 })) }))
  if (completed.interaction.stateId === 'wait' && completed.interaction.request.kind === 'choice') { const skip = completed.interaction.request.options.find(o => o.value === '__skip__' || o.value === '__done__'); if (skip) completed = ok(session.resolveChoice(actor, skip.value)) }
  return completed
}
export function schedule(r: SessionResponse) { return r.state.futureMeeples.filter(e => e.cardId === WALL).map(e => ({ round: e.round, food: e.resources.food, owner: e.playerId })).sort((a,b) => a.round-b.round) }
export function finish(session: GameSession) {
  turn(session, 0, 'grain-seeds'); turn(session, 1, 'reed-bank'); turn(session, 0, 'day-laborer'); let r = confirmNext(session, turn(session, 1, 'clay-pit'))
  for (let n = 0; n < 15 && r.interaction.stateId === 'wait'; n++) {
    const i = r.interaction
    if (i.request.kind === 'feed') r = ok(session.resolveChoice(i.playerIndex, 'confirm', { selections: [] }))
    else if (i.request.kind === 'confirm-player-switch') r = ok(session.resolveChoice(i.request.toPlayerIndex, 'confirm'))
    else assert.fail(JSON.stringify(i))
  }
  assert.equal(r.interaction.stateId, 'idle'); return r
}
