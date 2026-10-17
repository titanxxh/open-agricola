// Helpers of ae-negative-45-phase-session.test.ts from the negative audit snapshot fafd4f51b.
import assert from 'node:assert/strict'
import fs from '../audit-evidence-fs'
import type { ActionChoiceOption, GameState } from '../../../../shared/contract/types'
import { familySize } from '../../../../shared/domain/player'
import type { GameSession, SessionResponse } from '../../../game/authoritative-session'
import { confirmNext, passPreparationExchanges } from '../negative-rule-audit'
import { createWorkSession } from '../session-fixtures'

export const sessions: GameSession[] = []
export const output = process.env.AGRICOLA_NEGATIVE_ARTIFACT_DIR ?? 'output/ae-negative/45-phase'
export function save(id: string, r: SessionResponse) { fs.mkdirSync(output, { recursive: true }); fs.writeFileSync(`${output}/${id}.json`, JSON.stringify({ resources: r.state.players.map(p => p.resources), occupations: r.state.players.map(p => p.occupationPlayed), family: r.state.players.map(familySize), workers: r.state.players.map(p => p.workers), spaces: r.state.actionSpaces.map(s => ({ id: s.id, takenBy: s.takenBy, resources: s.resources })), round: r.state.round, interaction: r.interaction, log: r.state.log, scores: r.scores }, null, 2)); }
export function ok(r: SessionResponse) { assert.equal(r.ok, true, `${r.error} ${JSON.stringify(r.interaction)}`); return r; }
export function setup(card: string, round: number, configure: (s: GameState) => void = () => { }) { const s = createWorkSession({ seed: 4242, options: { playerCount: 2 }, configure(state) { state.round = round; for (const p of state.players) {
    p.minorHand = ['__test_placeholder__']
    p.occupationHand = ['__test_placeholder__']
    Object.assign(p.resources, { food: 20, wood: 0, clay: 0, reed: 0, stone: 0, grain: 0, vegetable: 0 })
  } state.players[0]!.occupationPlayed = [card]; configure(state); } }); sessions.push(s); return s; }
export function choice(s: GameSession, r: SessionResponse, predicate: (o: ActionChoiceOption) => boolean) { assert.equal(r.interaction.stateId, 'wait'); const o = optionsOf(r)?.find(predicate); assert.ok(o, JSON.stringify(r.interaction)); return ok(s.resolveChoice(actorOf(r), o.value)); }
export function finish(s: GameSession, r: SessionResponse) { for (let n = 0; n < 64 && r.interaction.stateId === 'wait' && requestOf(r).kind !== 'confirm-next-player'; n++) {
  r = passPreparationExchanges(s, r)
  if (r.interaction.stateId !== 'wait')
    break
  const i = r.interaction
  if (i.request.kind === 'confirm-player-switch')
    r = ok(s.resolveChoice(i.playerIndex, 'confirm'))
  else if (i.request.kind === 'feed')
    r = ok(s.resolveChoice(i.playerIndex, 'confirm', { selections: [] }))
  else if (i.request.kind === 'select-trigger')
    r = choice(s, r, o => o.labelKey !== 'actions.exchange.name' && o.value !== '__pass__')
  else
    r = choice(s, r, o => ['__skip__', '__done__', '__pass__'].includes(o.value))
} return r; }
export function turn(s: GameSession, space: string) { let r = s.getState(); if (r.interaction.stateId === 'wait' && requestOf(r).kind === 'confirm-next-player')
  r = confirmNext(s, r); r = finish(s, r); assert.equal(r.interaction.stateId, 'idle', JSON.stringify(r.interaction)); return ok(s.takeAction(r.state.currentPlayerIndex, space)); }
export function completeRound(s: GameSession, both = false) { const round = s.state.round; finish(s, turn(s, 'grain-seeds')); finish(s, turn(s, both ? 'vegetable-seeds' : 'clay-pit')); finish(s, turn(s, 'forest')); let r = finish(s, turn(s, 'reed-bank')); if (r.interaction.stateId === 'wait' && requestOf(r).kind === 'confirm-next-player')
  r = confirmNext(s, r); assert.ok(r.state.round > round || r.state.roundPhase !== 'work', JSON.stringify(r.interaction)); return r; }
export function optionsOf(r: SessionResponse): ActionChoiceOption[] {
  const i = r.interaction
  return i.stateId === 'wait' && 'options' in i.request ? i.request.options ?? [] : []
}
export function requestOf(r: SessionResponse) {
  if (r.interaction.stateId !== 'wait')
    throw new Error('Expected waiting native interaction')
  return r.interaction.request
}
export function actorOf(r: SessionResponse) {
  if (r.interaction.stateId !== 'wait')
    throw new Error('Expected waiting native actor')
  return r.interaction.playerIndex
}
