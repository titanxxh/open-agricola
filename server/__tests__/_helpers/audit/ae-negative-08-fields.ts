// Helpers of ae-negative-08-fields-session.test.ts from the negative audit snapshot fafd4f51b.
import assert from 'node:assert/strict'
import { mkdirSync, writeFileSync } from '../audit-evidence-fs'
import type { GameSession, SessionResponse } from '../../../game/authoritative-session'
import type { GameState, Resource } from '../../../../shared/contract/types'
import { createWorkSession } from '../session-fixtures'
import { assertRejectedUnchanged, confirmNext } from '../negative-rule-audit'

export const HORSE = 'A048_ShavingHorse', KNIFE = 'A058_AsparagusKnife', RIDGER = 'A059_PotatoRidger', BASE = 'A004_Baseboards'
export const artifactRoot = process.env.AGRICOLA_NEGATIVE_ARTIFACT_DIR ?? `output/ae-negative/oa-artifacts/${Date.now()}-${process.pid}`
mkdirSync(artifactRoot, { recursive: true })
export function save(name: string, value: unknown) { writeFileSync(`${artifactRoot}/${name}.json`, JSON.stringify(value, null, 2)) }
export const sessions: GameSession[] = []
export function ok(r: SessionResponse) { assert.equal(r.ok, true, r.error); return r }
export function setup(card: string, { round = 5, played = false, occupations = 0, resources = {} }: { round?: number; played?: boolean; occupations?: number; resources?: Partial<Resource> } = {}, configure: (state: GameState) => void = () => {}) {
  const s = createWorkSession({ seed: 4242, options: { playerCount: 2 }, configure(state) {
    state.round = round; state.availableMajorImprovements = []
    for (const p of state.players) Object.assign(p.resources, { food: 40, wood: 0, clay: 0, reed: 0, stone: 0, grain: 0, vegetable: 0 })
    const p = state.players[0]!
    p.minorHand = played ? ['__test_placeholder__'] : [card, '__test_placeholder__']; p.minorPlayed = played ? [card] : []
    p.occupationPlayed = ['D115_FodderPlanter', 'A111_WallBuilder', 'A125_Priest'].slice(0, occupations)
    Object.assign(p.resources, resources); configure(state)
  } }); sessions.push(s); return s
}
export function options(r: SessionResponse) { assert.ok(r.interaction.stateId === 'wait' && (r.interaction.request.kind === 'choice' || r.interaction.request.kind === 'select-trigger'), JSON.stringify(r.interaction)); return r.interaction.request.options }
export function choose(s: GameSession, r: SessionResponse, predicate: (o: { value: string; labelKey?: string }) => boolean) { const o = options(r).find(predicate); assert.ok(o, JSON.stringify(r.interaction)); assert.ok(r.interaction.stateId === 'wait'); return ok(s.resolveChoice(r.interaction.playerIndex, o.value)) }
export function buyMenu(s: GameSession, space = 'meeting-place') { let r = ok(s.takeAction(0, space)); if (r.interaction.stateId === 'wait' && r.interaction.request.kind === 'choice' && r.interaction.request.options.some(o => o.value.startsWith('action-improvement-'))) r = choose(s, r, o => o.value.startsWith('action-improvement-')); return r }
export function buy(s: GameSession, card: string, space = 'meeting-place') { const r = buyMenu(s, space); if (!r.state.players[0]!.minorHand.includes(card)) return r; assert.ok(options(r).some(o => o.value === card && !('disabled' in o && o.disabled))); return ok(s.resolveChoice(0, card)) }
export function deny(s: GameSession, card: string) { const r = buyMenu(s); assert.ok(!r.state.players[0]!.minorPlayed.includes(card)); assertRejectedUnchanged(s, () => s.resolveChoice(0, card)) }
export function ready(s: GameSession, actor: number) { let r = s.getState(); if (r.interaction.stateId === 'wait' && r.interaction.request.kind === 'confirm-next-player') r = confirmNext(s, r); assert.equal(r.interaction.stateId, 'idle', JSON.stringify(r.interaction)); assert.equal(r.state.currentPlayerIndex, actor); return r }
export function turn(s: GameSession, actor: number, space: string) { ready(s, actor); return ok(s.takeAction(actor, space)) }
export function cardFlow(s: GameSession, r: SessionResponse, card: string, accept = true) {
  for (let n = 0; n < 8 && r.interaction.stateId === 'wait'; n++) {
    if (r.interaction.request.kind === 'select-trigger') { const o = r.interaction.request.options.find(o => o.value === card); assert.ok(o, JSON.stringify(r.interaction)); r = ok(s.resolveChoice(r.interaction.playerIndex, o.value)); continue }
    if (r.interaction.request.kind !== 'choice') break
    const opts = r.interaction.request.options; const o = opts.find(o => accept ? o.value !== '__skip__' && !o.disabled : o.value === '__skip__'); assert.ok(o, JSON.stringify(r.interaction)); r = ok(s.resolveChoice(r.interaction.playerIndex, o.value))
  }
  return r
}
export function goods(r: SessionResponse) { return [r.state.players[0]!.resources.wood, r.state.players[0]!.resources.food] }
export function forest(initial: number, gain = 3, played = true) { return setup(HORSE, { played, resources: { wood: initial } }, state => { state.actionSpaces.find(a => a.id === 'forest')!.resources.wood = gain }) }
export function fields(state: GameState, crop: 'vegetable' | 'grain', amounts: number[], owner = 0) { state.players[owner]!.fields = amounts.map((remaining, i) => ({ row: 0, col: 1 + i, stacks: remaining > 0 ? [{ kind: crop, remaining }] : [] })) }
export function phase(card: string, round = 8, amounts = [2], vegetable = 0, played = true, configure: (state: GameState) => void = () => {}) { return setup(card, { round, played, resources: { vegetable } }, state => { fields(state, 'vegetable', amounts); configure(state) }) }
export function end(s: GameSession) { turn(s, 0, 'grain-seeds'); turn(s, 1, 'forest'); turn(s, 0, 'reed-bank'); return confirmNext(s, turn(s, 1, 'clay-pit')) }
export function remaining(r: SessionResponse, owner = 0) { return r.state.players[owner]!.fields.map(f => f.stacks.reduce((n, stack) => n + stack.remaining, 0)) }
export function bonus(r: SessionResponse) { const value = r.state.players[0]!.cardStates[KNIFE]?.counters?.bonusVp ?? 0; assert.ok(r.scores); assert.ok(r.scores[0]); assert.equal(r.scores[0].categories.find(c => c.key === 'cardBonusVp')?.entries.find(e => e.type === 'bonus' && e.cardId === KNIFE)?.score ?? 0, value); return value }
export function knifeResult(r: SessionResponse) { return { remaining: remaining(r), vegetable: r.state.players[0]!.resources.vegetable, food: r.state.players[0]!.resources.food, bonus: bonus(r) } }
export function takeField(s: GameSession, r: SessionResponse, target = { row: 0, col: 1 }, exchange = true) { r = cardFlow(s, r, KNIFE); if (r.interaction.stateId === 'wait' && r.interaction.request.kind === 'selection') r = ok(s.commitSelectionChoice(r.interaction.playerIndex, { positions: [target] })); return exchange ? cardFlow(s, r, KNIFE) : r }
export function potato(vegetable = 2, amounts = [2], configure: (state: GameState) => void = () => {}) { return phase(RIDGER, 4, amounts, vegetable, true, configure) }
export function potatoResult(r: SessionResponse) { return [r.state.players[0]!.resources.vegetable, r.state.players[0]!.resources.food] }
