// Helpers of ae-negative-10-timing-session.test.ts from the negative audit snapshot fafd4f51b.
import assert from 'node:assert/strict'
import { mkdirSync } from '../audit-evidence-fs'
import type { GameSession, SessionResponse } from '../../../game/authoritative-session'
import type { GameState, Resource } from '../../../../shared/contract/types'
import { createWorkSession } from '../session-fixtures'
import { assertRejectedUnchanged, confirmNext } from '../negative-rule-audit'

export const GREEN = 'A069_LargeGreenhouse', TREE = 'A074_StableTree', COB = 'A076_Cob', PLANNER = 'A089_StablePlanner'
export const sessions: GameSession[] = []
export const directory = process.env.AGRICOLA_NEGATIVE_ARTIFACT_DIR ?? `output/ae-negative/10-timing-oa-${Date.now()}-${process.pid}`
mkdirSync(directory, { recursive: true })
export const evidence: unknown[] = []
export function ok(r: SessionResponse) { assert.equal(r.ok, true, r.error); return r }
export function record(name: string, r: SessionResponse) { evidence.push({ name, serializedResponse: JSON.stringify(r) }); return r }
export function setup(card: string, { round = 5, played = false, occupations = 2, resources = {} }: { round?: number; played?: boolean; occupations?: number; resources?: Partial<Resource> } = {}, configure: (state: GameState) => void = () => {}) {
  const s = createWorkSession({ seed: 4242, options: { playerCount: 2 }, configure(state) {
    state.round = round; state.availableMajorImprovements = []
    for (const p of state.players) { p.minorHand = ['__test_placeholder__']; p.occupationHand = ['__test_placeholder__']; p.minorPlayed = []; p.occupationPlayed = []; Object.assign(p.resources, { food: 40, wood: 0, clay: 0, reed: 0, stone: 0, grain: 0, vegetable: 0 }); assert.equal(p.workers.length, 5); assert.equal(p.workers.filter(w => w.isActive).length, 2) }
    const p = state.players[0]!
    p.minorHand = played ? ['B007_Wage', '__test_placeholder__'] : [card, 'B007_Wage', 'A016_RammedClay']; p.minorPlayed = played ? [card] : []
    p.occupationPlayed = ['D115_FodderPlanter', 'A111_WallBuilder', 'A125_Priest'].slice(0, occupations)
    Object.assign(p.resources, resources); configure(state)
  } }); sessions.push(s); record('fixture', s.getState()); return s
}
export function options(r: SessionResponse) { assert.ok(r.interaction.stateId === 'wait' && (r.interaction.request.kind === 'choice' || r.interaction.request.kind === 'select-trigger'), JSON.stringify(r.interaction)); return r.interaction.request.options }
export function choose(s: GameSession, r: SessionResponse, predicate: (o: { value: string; labelKey?: string; sourceCard?: string }) => boolean) { const o = options(r).find(predicate); assert.ok(o, JSON.stringify(r.interaction)); assert.ok(r.interaction.stateId === 'wait'); return record(`resolveChoice:${o.value}`, ok(s.resolveChoice(r.interaction.playerIndex, o.value))) }
export function buyMenu(s: GameSession) { let r = record('takeAction:meeting-place', ok(s.takeAction(0, 'meeting-place'))); if (r.interaction.stateId === 'wait' && r.interaction.request.kind === 'choice' && r.interaction.request.options.some(o => o.value.startsWith('action-improvement-'))) r = choose(s, r, o => o.value.startsWith('action-improvement-')); return r }
export function buy(s: GameSession, card: string) { const r = buyMenu(s); if (r.state.players[0]!.minorPlayed.includes(card)) return r; assert.ok(options(r).some(o => o.value === card && !('disabled' in o && o.disabled))); return record(`buy:${card}`, ok(s.resolveChoice(0, card))) }
export function deny(s: GameSession, card: string) { let r = buyMenu(s); assert.ok(!r.state.players[0]!.minorPlayed.includes(card)); record(`denied:${card}`, assertRejectedUnchanged(s, () => s.resolveChoice(0, card))); const food = r.state.players[0]!.resources.food; r = ok(s.resolveChoice(0, 'B007_Wage')); assert.equal(r.state.players[0]!.resources.food, food + 2); return r }
export function ready(s: GameSession, actor: number) { let r = s.getState(); if (r.interaction.stateId === 'wait' && r.interaction.request.kind === 'confirm-next-player') r = record('confirm', confirmNext(s, r)); assert.equal(r.interaction.stateId, 'idle', JSON.stringify(r.interaction)); assert.equal(r.state.currentPlayerIndex, actor); return r }
export function turn(s: GameSession, actor: number, space: string) { ready(s, actor); return record(`takeAction:${actor}:${space}`, ok(s.takeAction(actor, space))) }
export function rounds(r: SessionResponse, card: string, resource: string) { const entries = r.state.futureMeeples.filter(e => e.cardId === card); for (const e of entries) { assert.equal(e.playerId, r.state.players[0]!.id); assert.deepEqual(e.resources, { [resource]: 1 }) } return entries.map(e => e.round).sort((a, b) => a - b) }
export function complete(s: GameSession, partial = false) { if (!partial) turn(s, 0, 'reed-bank'); turn(s, 1, 'forest'); turn(s, 0, 'day-laborer'); return record('round-confirm', confirmNext(s, turn(s, 1, 'clay-pit'))) }
export function finish(s: GameSession, r: SessionResponse) { if (r.interaction.stateId === 'wait' && r.interaction.request.kind === 'choice' && r.interaction.request.options.some(o => o.value === '__done__')) return choose(s, r, o => o.value === '__done__'); return r }
export function stableMenu(s: GameSession, actor = 0) { let r = turn(s, actor, 'farm-expansion'); if (r.interaction.stateId === 'wait' && r.interaction.request.kind === 'choice') r = choose(s, r, o => o.labelKey === 'actions.stables.name'); assert.ok(r.interaction.stateId === 'wait' && r.interaction.request.kind === 'farm-select' && r.interaction.request.farm.farmType === 'stable', JSON.stringify(r.interaction)); return r }
export function build(s: GameSession, tiles = [{ row: 0, col: 1 }], actor = 0) { stableMenu(s, actor); return finish(s, record('build-stables', ok(s.commitSelectionChoice(actor, { stables: tiles })))) }
export function resources(r: SessionResponse) { const p = r.state.players[0]!.resources; return { clay: p.clay, grain: p.grain, food: p.food } }
export function exchange(s: GameSession, r: SessionResponse, accept = true) { if (r.interaction.stateId === 'wait' && r.interaction.request.kind === 'select-trigger') r = choose(s, r, o => o.sourceCard === COB || o.value.includes(COB)); assert.ok(r.interaction.stateId === 'wait' && r.interaction.request.kind === 'choice', JSON.stringify(r.interaction)); return choose(s, r, o => accept ? o.value !== '__skip__' && !('disabled' in o && o.disabled) : o.value === '__skip__') }
