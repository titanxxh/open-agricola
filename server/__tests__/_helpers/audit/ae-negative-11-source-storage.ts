// Helpers of ae-negative-11-source-storage-session.test.ts from the negative audit snapshot fafd4f51b.
import assert from 'node:assert/strict'
import fs from '../audit-evidence-fs'
import type { GameSession, SessionResponse } from '../../../game/authoritative-session'
import type { GameState, Resource } from '../../../../shared/contract/types'
import { createWorkSession } from '../session-fixtures'
import { assertRejectedUnchanged, confirmNext } from '../negative-rule-audit'

export const STORE = 'A081_InterimStorage', CERT = 'A082_WorkCertificate', CULT = 'A091_ShiftingCultivator', FALLBACK = 'B007_Wage'
export const root = process.env.AGRICOLA_NEGATIVE_ARTIFACT_DIR ?? 'output/ae-negative/11-source-storage-probes'
export const sessions: GameSession[] = []
export const saved: string[] = []
export function save(id: string, value: unknown) { fs.mkdirSync(root, { recursive: true }); fs.writeFileSync(`${root}/${id}.json`, JSON.stringify(value, null, 2)); saved.push(`${root}/${id}.json`) }
export function ok(r: SessionResponse) { assert.equal(r.ok, true, r.error); return r }
export function setup(card: string, { played = true, round = 5, resources = {}, occupations = 0 }: { played?: boolean; round?: number; resources?: Partial<Resource>; occupations?: number } = {}, configure: (state: GameState) => void = () => {}) {
 const s = createWorkSession({ seed: 4242, options: { playerCount: 2 }, configure(state) {
  state.round = round; state.availableMajorImprovements = []
  for (const p of state.players) Object.assign(p.resources, { food: 40, wood: 0, clay: 0, reed: 0, stone: 0, grain: 0, vegetable: 0 })
  const p = state.players[0]!; p.minorHand = played ? ['__test_placeholder__'] : [card, FALLBACK]; p.minorPlayed = played ? [card] : []; p.occupationPlayed = ['A125_Priest', 'A111_WallBuilder', 'A124_Knapper'].slice(0, occupations); if (card === CULT) { p.minorPlayed = []; p.minorHand = ['__test_placeholder__']; p.occupationHand = played ? ['__test_placeholder__'] : [CULT]; if (played) p.occupationPlayed.push(CULT) }
  Object.assign(p.resources, resources); configure(state)
 } }); sessions.push(s); for (const p of s.getState().state.players) { assert.equal(p.workers.length, 5); assert.equal(p.workers.filter(w => w.isActive).length, 2); assert.equal(p.fenceSegments.length, 0); assert.equal(p.stableTiles.length, 0) } return s
}
export function choices(r: SessionResponse) { assert.ok(r.interaction.stateId === 'wait' && r.interaction.request.kind === 'choice', JSON.stringify(r.interaction)); return r.interaction.request.options }
export function buyMenu(s: GameSession) { let r = ok(s.takeAction(0, 'meeting-place')); if (r.interaction.stateId === 'wait' && r.interaction.request.kind === 'choice') { const o = r.interaction.request.options.find(o => o.value.startsWith('action-improvement-')); if (o) r = ok(s.resolveChoice(0, o.value)) } return r }
export function buy(s: GameSession, card: string) { const r = buyMenu(s); if (!r.state.players[0]!.minorHand.includes(card)) return r; assert.ok(choices(r).some(o => o.value === card && !o.disabled)); return ok(s.resolveChoice(0, card)) }
export function deny(s: GameSession, card: string) { const r = buyMenu(s); assert.ok(!r.state.players[0]!.minorPlayed.includes(card)); assertRejectedUnchanged(s, () => s.resolveChoice(0, card)) }
export function ready(s: GameSession, actor: number) { let r = s.getState(); if (r.interaction.stateId === 'wait' && r.interaction.request.kind === 'confirm-next-player') r = confirmNext(s, r); assert.equal(r.interaction.stateId, 'idle', JSON.stringify(r.interaction)); assert.equal(r.state.currentPlayerIndex, actor); return r }
export function turn(s: GameSession, actor: number, space: string) { ready(s, actor); return ok(s.takeAction(actor, space)) }
export function end(s: GameSession) { turn(s, 0, 'grain-seeds'); turn(s, 1, 'forest'); turn(s, 0, 'day-laborer'); return confirmNext(s, turn(s, 1, 'clay-pit')) }
export function flow(s: GameSession, r: SessionResponse, card: string, accept = true) {
 for (let n = 0; n < 8 && r.interaction.stateId === 'wait'; n++) {
  const request = r.interaction.request
  if (request.kind === 'select-trigger') { const o = request.options.find(o => o.value === card); assert.ok(o, JSON.stringify(r.interaction)); r = ok(s.resolveChoice(r.interaction.playerIndex, o.value)); continue }
  if (request.kind !== 'choice') break
  const o = request.options.find(o => accept ? o.value !== '__skip__' && !o.disabled : o.value === '__skip__'); assert.ok(o, JSON.stringify(r.interaction)); r = ok(s.resolveChoice(r.interaction.playerIndex, o.value))
 } return r
}
export function storage(r: SessionResponse) { const c = r.state.players[0]!.cardStates[STORE]?.counters; return { wood: c?.wood ?? 0, clay: c?.clay ?? 0, reed: c?.reed ?? 0 } }
export function supply(r: SessionResponse) { const p = r.state.players[0]!; return { wood: p.resources.wood, clay: p.resources.clay, reed: p.resources.reed, stone: p.resources.stone } }
export function stock(state: GameState, space: string, resource: keyof Resource, amount: number) { state.actionSpaces.find(s => s.id === space)!.resources[resource] = amount }
export function store(round = 6, configure: (state: GameState) => void = () => {}) { return setup(STORE, { round }, configure) }
export function certificate({ forest = 4, played = true, food = 40, occupations = 3 }: { forest?: number; played?: boolean; food?: number; occupations?: number } = {}, configure: (state: GameState) => void = () => {}) { return setup(CERT, { played, round: 14, occupations, resources: { food } }, state => { for (const a of state.actionSpaces) for (const res of ['wood', 'clay', 'reed', 'stone'] satisfies Array<keyof Resource>) a.resources[res] = 0; stock(state, 'forest', 'wood', forest); configure(state) }) }
export function cultivator({ played = true, food = 3, occupations = 0, round = 5 }: { played?: boolean; food?: number; occupations?: number; round?: number } = {}, configure: (state: GameState) => void = () => {}) { return setup(CULT, { played, round, occupations, resources: { food } }, state => { stock(state, 'forest', 'wood', 3); configure(state) }) }
export function lesson(s: GameSession) { let r = turn(s, 0, 'lessons'); if (r.state.players[0]!.occupationHand.includes(CULT)) r = ok(s.resolveChoice(0, CULT)); return r }
export function plow(s: GameSession, r: SessionResponse, tile = { row: 0, col: 1 }) { r = flow(s, r, CULT); assert.ok(r.interaction.stateId === 'wait' && r.interaction.request.kind === 'farm-select', JSON.stringify(r.interaction)); return ok(s.commitSelectionChoice(0, { tile })) }
export function farm(state: GameState, count: number) { const cells = Array.from({ length: 15 }, (_, i) => ({ row: Math.floor(i / 5), col: i % 5 })).filter(t => !(t.col === 0 && t.row > 0)); state.players[0]!.fields = cells.slice(0, count).map(t => ({ ...t, stacks: [] })) }
