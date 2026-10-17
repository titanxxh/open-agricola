// Helpers of ae-negative-10-field-source-session.test.ts from the negative audit snapshot fafd4f51b.
import assert from 'node:assert/strict'
import fs from '../audit-evidence-fs'
import type { GameSession, SessionResponse } from '../../../game/authoritative-session'
import type { GameState, Resource } from '../../../../shared/contract/types'
import { createWorkSession } from '../session-fixtures'
import { assertRejectedUnchanged, confirmNext } from '../negative-rule-audit'

export const LIFT = 'A070_LiftingMachine', SPADE = 'A071_ClearingSpade', CALCIUM = 'A072_CalciumFertilizers'
export const root = process.env.AGRICOLA_NEGATIVE_ARTIFACT_DIR ?? 'output/ae-negative/10-field-source-probes'
export const sessions: GameSession[] = []
export const saved: string[] = []
export function save(id: string, value: unknown) { fs.mkdirSync(root, { recursive: true }); fs.writeFileSync(`${root}/${id}.json`, JSON.stringify(value, null, 2)); saved.push(`${root}/${id}.json`) }
export function ok(r: SessionResponse) { assert.equal(r.ok, true, r.error); return r }
export function setup(card: string, { played = true, round = 5, resources = {} }: { played?: boolean; round?: number; resources?: Partial<Resource> } = {}, configure: (state: GameState) => void = () => {}) {
 const s = createWorkSession({ seed: 4242, options: { playerCount: 2 }, configure(state) {
  state.round = round; state.availableMajorImprovements = []
  for (const p of state.players) Object.assign(p.resources, { food: 40, wood: 0, clay: 0, reed: 0, stone: 0, grain: 0, vegetable: 0 })
  const p = state.players[0]!; p.minorHand = played ? ['__test_placeholder__'] : [card, '__test_placeholder__']; p.minorPlayed = played ? [card] : []
  Object.assign(p.resources, resources); configure(state)
 } }); sessions.push(s); for (const p of s.getState().state.players) { assert.equal(p.workers.length, 5); assert.equal(p.workers.filter(w => w.isActive).length, 2); assert.equal(p.fenceSegments.length, 0); assert.equal(p.stableTiles.length, 0) } return s
}
export function choices(r: SessionResponse) { assert.ok(r.interaction.stateId === 'wait' && r.interaction.request.kind === 'choice', JSON.stringify(r.interaction)); return r.interaction.request.options }
export function buyMenu(s: GameSession) { let r = ok(s.takeAction(0, 'meeting-place')); if (r.interaction.stateId === 'wait' && r.interaction.request.kind === 'choice') { const o = r.interaction.request.options.find(o => o.value.startsWith('action-improvement-')); if (o) r = ok(s.resolveChoice(0, o.value)) } return r }
export function buy(s: GameSession, card: string) { const r = buyMenu(s); if (!r.state.players[0]!.minorHand.includes(card)) return r; assert.ok(choices(r).some(o => o.value === card && !o.disabled)); return ok(s.resolveChoice(0, card)) }
export function deny(s: GameSession, card: string) { const r = buyMenu(s); assert.ok(!r.state.players[0]!.minorPlayed.includes(card)); assertRejectedUnchanged(s, () => s.resolveChoice(0, card)) }
export function ready(s: GameSession, actor: number) { let r = s.getState(); if (r.interaction.stateId === 'wait' && r.interaction.request.kind === 'confirm-next-player') r = confirmNext(s, r); assert.equal(r.interaction.stateId, 'idle', JSON.stringify(r.interaction)); assert.equal(r.state.currentPlayerIndex, actor); return r }
export function turn(s: GameSession, actor: number, space: string) { ready(s, actor); return ok(s.takeAction(actor, space)) }
export function end(s: GameSession) { turn(s, 0, 'reed-bank'); turn(s, 1, 'forest'); turn(s, 0, 'grain-seeds'); return confirmNext(s, turn(s, 1, 'clay-pit')) }
export function flow(s: GameSession, r: SessionResponse, card: string, accept = true) {
 for (let n = 0; n < 8 && r.interaction.stateId === 'wait'; n++) {
  const request = r.interaction.request
  if (request.kind === 'select-trigger') { const o = request.options.find(o => o.value === card); assert.ok(o, JSON.stringify(r.interaction)); r = ok(s.resolveChoice(r.interaction.playerIndex, o.value)); continue }
  if (request.kind !== 'choice') break
  const o = request.options.find(o => accept ? o.value !== '__skip__' && !o.disabled : o.value === '__skip__'); assert.ok(o, JSON.stringify(r.interaction)); r = ok(s.resolveChoice(r.interaction.playerIndex, o.value))
 } return r
}
export function fields(state: GameState, crops: Array<{ kind: 'grain' | 'vegetable'; remaining: number } | null>, owner = 0, start = 1) { state.players[owner]!.fields = crops.map((crop, i) => ({ row: 0, col: start + i, stacks: crop ? [crop] : [] })) }
export function board(r: SessionResponse, owner = 0) { return r.state.players[owner]!.fields.map(f => f.stacks.reduce((n, v) => n + v.remaining, 0)) }
export function lift({ played = true, round = 5, multi = false, resources = {} }: { played?: boolean; round?: number; multi?: boolean; resources?: Partial<Resource> } = {}) { return setup(LIFT, { played, round, resources }, state => { fields(state, multi ? [{ kind: 'vegetable', remaining: 2 }, { kind: 'vegetable', remaining: 1 }, { kind: 'grain', remaining: 2 }, null] : [{ kind: 'vegetable', remaining: 2 }, { kind: 'grain', remaining: 2 }, null]); fields(state, [{ kind: 'vegetable', remaining: 2 }], 1, 4) }) }
export function selection(s: GameSession, r: SessionResponse, position = { row: 0, col: 1 }) { assert.ok(r.interaction.stateId === 'wait' && r.interaction.request.kind === 'selection', JSON.stringify(r.interaction)); return ok(s.commitSelectionChoice(r.interaction.playerIndex, { positions: [position] })) }
export function result(r: SessionResponse) { return { own: board(r), opponent: board(r, 1), vegetable: r.state.players[0]!.resources.vegetable, grain: r.state.players[0]!.resources.grain } }
export const SPADE_ACTION = 'A71-clearing-spade-anytime'
export function spade(crop: 'grain' | 'vegetable' = 'grain', count = 2, empty = true, configure: (state: GameState) => void = () => {}) { return setup(SPADE, {}, state => { fields(state, [count ? { kind: crop, remaining: count } : null, empty ? null : { kind: 'vegetable', remaining: 1 }, null]); configure(state) }) }
export function openSpade(s: GameSession) { return ok(s.takeAnytimeAction(0, SPADE_ACTION)) }
export function move(s: GameSession, source = { row: 0, col: 1 }, target = { row: 0, col: 2 }) { return selection(s, selection(s, openSpade(s), source), target) }
export function cropSupply(r: SessionResponse) { return { grain: r.state.players[0]!.resources.grain, vegetable: r.state.players[0]!.resources.vegetable } }
export function calcium(played = true, configure: (state: GameState) => void = () => {}) { return setup(CALCIUM, { played, round: 14 }, state => { fields(state, [{ kind: 'grain', remaining: 2 }, { kind: 'vegetable', remaining: 1 }, null]); for (const space of ['eastern-quarry', 'western-quarry']) state.actionSpaces.find(s => s.id === space)!.resources.stone = 1; configure(state) }) }
