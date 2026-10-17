// Helpers of ae-negative-45-placement-session.test.ts from the negative audit snapshot fafd4f51b.
import assert from 'node:assert/strict'
import fs from '../audit-evidence-fs'
import type { ActionChoiceOption, GameState } from '../../../../shared/contract/types'
import { familySize } from '../../../../shared/domain/player'
import type { GameSession, SessionResponse } from '../../../game/authoritative-session'
import { confirmNext, passPreparationExchanges } from '../negative-rule-audit'
import { createWorkSession } from '../session-fixtures'

export const sessions: GameSession[] = []
export const output = process.env.AGRICOLA_NEGATIVE_ARTIFACT_DIR ?? 'output/ae-negative/45-placement'
export function save(id: string, r: SessionResponse) { fs.mkdirSync(output, { recursive: true }); fs.writeFileSync(`${output}/${id}.json`, JSON.stringify({ players: r.state.players.map(p => ({ resources: p.resources, family: familySize(p), workers: p.workers, occupations: p.occupationPlayed, cardStates: p.cardStates, houseAnimals: p.houseAnimals })), spaces: r.state.actionSpaces.map(a => ({ id: a.id, takenBy: a.takenBy, resources: a.resources })), interaction: r.interaction, scores: r.scores, log: r.state.log }, null, 2)); }
export function ok(r: SessionResponse) { assert.equal(r.ok, true, `${r.error} ${JSON.stringify(r.interaction)}`); return r; }
export function setup(card: string, configure: (state: GameState) => void = () => { }, round = 8) { const s = createWorkSession({ seed: 4242, options: { playerCount: 2 }, configure(state) { state.round = round; for (const p of state.players) {
    p.minorHand = ['__test_placeholder__']
    p.occupationHand = ['__test_placeholder__']
    Object.assign(p.resources, { food: 2, wood: 0, clay: 0, reed: 0, stone: 0, grain: 0 })
  } state.players[0]!.occupationPlayed = [card]; state.actionSpaces.find(a => a.id === 'forest')!.resources.wood = 3; state.actionSpaces.find(a => a.id === 'clay-pit')!.resources.clay = 2; configure(state); } }); sessions.push(s); return s; }
export function choice(s: GameSession, r: SessionResponse, predicate: (o: ActionChoiceOption) => boolean) { assert.equal(r.interaction.stateId, 'wait'); const o = optionsOf(r)?.find(predicate); assert.ok(o, JSON.stringify(r.interaction)); return ok(s.resolveChoice(actorOf(r), o.value)); }
export function finish(s: GameSession, r: SessionResponse, accept = false) { for (let n = 0; n < 24 && r.interaction.stateId === 'wait' && requestOf(r).kind !== 'confirm-next-player'; n++) {
  r = passPreparationExchanges(s, r)
  if (r.interaction.stateId !== 'wait')
    break
  if (r.interaction.request.kind === 'animal-reorg')
    r = ok(s.resolveChoice(actorOf(r), 'confirm', { zones: r.interaction.request.zones }))
  else if (requestOf(r).kind === 'confirm-player-switch')
    r = ok(s.resolveChoice(actorOf(r), 'confirm'))
  else if (requestOf(r).kind === 'select-trigger')
    r = choice(s, r, o => o.value !== '__pass__' && o.labelKey !== 'actions.exchange.name')
  else
    r = choice(s, r, o => accept ? !['__skip__', '__done__', '__pass__'].includes(o.value) : ['__skip__', '__done__', '__pass__'].includes(o.value))
} return r; }
export function next(s: GameSession) { const r = s.getState(); assert.equal(requestOf(r).kind, 'confirm-next-player'); const n = confirmNext(s, r); assert.equal(n.interaction.stateId, 'idle'); return n; }
export function inspector(prior = 'forest', sheep = true) { const s = setup('D093_SheepInspector', state => { if (sheep) {
  const p = state.players[0]!
  p.resources.sheep = 1
  p.houseAnimals['1-0'] = 'sheep'
} }); finish(s, ok(s.takeAction(0, prior))); next(s); const r = finish(s, ok(s.takeAction(1, 'grain-seeds'))); next(s); return { s, r }; }
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
