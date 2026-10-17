// Helpers of ae-negative-09-harvest-session.test.ts from the negative audit snapshot fafd4f51b.
import assert from 'node:assert/strict'
import { mkdirSync, writeFileSync } from '../audit-evidence-fs'
import type { GameSession, SessionResponse } from '../../../game/authoritative-session'
import type { PlayerState, Field } from '../../../../shared/contract/types'
import { createWorkSession } from '../session-fixtures'
import { assertRejectedUnchanged, confirmNext, undoRuleSnapshot } from '../negative-rule-audit'

export const WAGE = 'B007_Wage'
export const CREDIT = 'A062_BeerKeg', JUNK = 'A064_BarleyMill', BASKET = 'A065_SeedPellets'
export const artifactDir = process.env.AGRICOLA_NEGATIVE_ARTIFACT_DIR ?? 'output/ae-negative/harvest09-oa-artifacts'
export const sessions: GameSession[] = [];
export let artifactSerial = 0
export function setup({ card = CREDIT, played = true, round = 4, occupations = [], hand = [], extra = [], resources = {}, opponent = {}, opponentHand = [], stock = 3, noCard = false, fields = [], opponentFields = [] }: { card?: string; played?: boolean; round?: number; occupations?: string[]; hand?: string[]; extra?: string[]; resources?: Partial<PlayerState['resources']>; opponent?: Partial<PlayerState['resources']>; opponentHand?: string[]; stock?: number; noCard?: boolean; fields?: Field[]; opponentFields?: Field[] } = {}) {
  const s = createWorkSession({ seed: 962, configure: state => {
    state.round = round; state.availableMajorImprovements = []
    state.players.forEach(p => {
      p.minorHand = ['__test_placeholder__']; p.occupationHand = ['__test_placeholder__']; p.minorPlayed = []; p.occupationPlayed = []; p.improvements = []; p.cardStates = {}
      Object.assign(p.resources, { wood: 0, clay: 0, reed: 0, stone: 0, food: 40, grain: 0, vegetable: 0, sheep: 0, boar: 0, cattle: 0, begging: 0 })
    })
    state.roundActionOrder = state.roundActionOrder.map(() => null); state.roundActionOrder[0] = 'grain-utilization'; state.actionSpaces.find(a => a.id === 'grain-utilization')!.roundAvailable = 1
    const p = state.players[0]!; p.fields = fields; state.players[1]!.fields = opponentFields
    p.minorHand = [...(!played && !noCard ? [card, WAGE, 'A016_RammedClay'] : []), ...hand, '__test_placeholder__']; p.minorPlayed = [...(played && !noCard ? [card] : []), ...extra]; p.occupationPlayed = occupations
    Object.assign(p.resources, resources); Object.assign(state.players[1]!.resources, opponent)
    state.players[1]!.minorHand = [...opponentHand, '__test_placeholder__']
    state.actionSpaces.find(a => a.id === 'forest')!.resources.wood = stock
  } }); sessions.push(s); return s
}
export function ok(r: SessionResponse) { assert.equal(r.ok, true, r.error); return r }
export function opts(r: SessionResponse) { return r.interaction.stateId === 'wait' && (r.interaction.request.kind === 'choice' || r.interaction.request.kind === 'select-trigger') ? r.interaction.request.options : [] }
export function choose(s: GameSession, r: SessionResponse, predicate: (o: { value: string; labelKey?: string; sourceCard?: string }) => boolean) { assert.ok(r.interaction.stateId === 'wait', JSON.stringify(r.interaction)); const o = opts(r).find(predicate); assert.ok(o, JSON.stringify(r.interaction)); return ok(s.resolveChoice(r.interaction.playerIndex, o.value)) }
export function ready(s: GameSession, actor: number) { let r = s.getState(); if (r.interaction.stateId === 'wait' && r.interaction.request.kind === 'confirm-next-player') r = confirmNext(s, r); assert.equal(r.interaction.stateId, 'idle', JSON.stringify(r.interaction)); assert.equal(r.state.currentPlayerIndex, actor); return r }
export function turn(s: GameSession, actor: number, space: string) { ready(s, actor); return ok(s.takeAction(actor, space)) }
export function minorMenu(s: GameSession, card: string) { let r = turn(s, 0, 'meeting-place'); mkdirSync(artifactDir, { recursive: true }); writeFileSync(`${artifactDir}/${card}-minor-menu.json`, JSON.stringify(r, null, 2)); if (!opts(r).some(o => o.value === card) && opts(r).some(o => o.value.startsWith('action-improvement-'))) r = choose(s, r, o => o.value.startsWith('action-improvement-')); return r }
export function buy(s: GameSession, card: string) { let r = minorMenu(s, card); if (!r.state.players[0]!.minorPlayed.includes(card)) r = choose(s, r, o => o.value === card); if (r.interaction.stateId === 'wait' && r.interaction.promptKey === 'prompt.selectPayment') r = choose(s, r, o => o.value !== 'cancel'); return r }
export function deny(s: GameSession, card: string) { const r = minorMenu(s, card); assert.ok(opts(r).some(o => o.value === WAGE && !('disabled' in o && o.disabled)), JSON.stringify(r.interaction)); assert.equal(opts(r).some(o => o.value === card && !('disabled' in o && o.disabled)), false); assertRejectedUnchanged(s, () => s.resolveChoice(0, card)); assert.equal(s.getState().state.players[0]!.minorPlayed.includes(card), false); const food = r.state.players[0]!.resources.food; const retry = ok(s.resolveChoice(0, WAGE)); resource(retry, 'food', food + 2); assert.equal(retry.state.players[0]!.minorPlayed.includes(card), false) }
export function gainCount(r: SessionResponse, card: string) { return r.state.log.filter(e => e.key === 'log.cardEffectGain' && e.params?.cardId === card).length }
export function resource(r: SessionResponse, key: 'food' | 'wood' | 'begging', value: number, actor = 0) { assert.equal(r.state.players[actor]!.resources[key], value) }
export function endWork(s: GameSession) { turn(s, 0, 'forest'); turn(s, 1, 'clay-pit'); turn(s, 0, 'reed-bank'); return confirmNext(s, turn(s, 1, 'day-laborer')) }
export function finishHarvest(s: GameSession, r: SessionResponse) { for (let n = 0; n < 8 && r.interaction.stateId === 'wait'; n++) { const request = r.interaction.request; if (request.kind === 'feed') r = ok(s.resolveChoice(r.interaction.playerIndex, 'confirm', { selections: [] })); else if (request.kind === 'confirm-player-switch') r = ok(s.resolveChoice(r.interaction.playerIndex, 'confirm')); else if (request.kind === 'confirm-next-player') r = confirmNext(s, r); else if (request.kind === 'choice' && opts(r).some(o => o.value === '__skip__')) r = ok(s.resolveChoice(r.interaction.playerIndex, '__skip__')); else assert.fail(JSON.stringify(r.interaction)) } return r }
export function purchaseUndo(before: string, r: SessionResponse) { ok(r); const norm = (v: string) => JSON.parse(v, (key, value: unknown) => key === 'playedCards' ? undefined : value); assert.deepEqual(norm(undoRuleSnapshot(r)), norm(before)); const packet = r.state.publicEventArchive.at(-1); assert.ok(packet?.type === 'publicEvents.canceled' && packet.reason === 'undoAction') }
export function save(name: string, r: SessionResponse) { mkdirSync(artifactDir, { recursive: true }); writeFileSync(`${artifactDir}/${name}-${++artifactSerial}.json`, JSON.stringify(r, null, 2)) }
export function beer(s: GameSession, r: SessionResponse, amount: number) { if (r.interaction.stateId === 'wait' && r.interaction.request.kind === 'select-trigger') r = ok(s.resolveChoice(0, CREDIT)); assert.ok(r.interaction.stateId === 'wait' && r.interaction.sourceCard === CREDIT, JSON.stringify(r.interaction)); return choose(s, r, o => { const full = opts(r).find(x => x.value === o.value); return full !== undefined && amountPaid(r, full.value, 'grain') === amount }) }
export function bonus(r: SessionResponse) { const n = r.state.players[0]!.cardStates[CREDIT]?.counters?.bonusVp ?? 0; assert.ok(r.scores); assert.equal(r.scores[0]!.categories.find(c => c.key === 'cardBonusVp')?.entries.filter(e => e.type === 'bonus' && e.cardId === CREDIT).reduce((sum, e) => sum + e.score, 0) ?? 0, n); return n }
export function fields(...crops: Array<'grain' | 'vegetable' | null>): Field[] { return crops.map((crop, i) => ({ row: i, col: 2, stacks: crop ? [{ kind: crop, remaining: crop === 'grain' ? 3 : 2 }] : [] })) }
export function sowStart(s: GameSession, actor = 0, space = 'grain-utilization') { let r = turn(s, actor, space); if (r.interaction.stateId === 'wait' && r.interaction.request.kind === 'choice') r = choose(s, r, o => o.value === 'sow' || o.value !== '__skip__'); assert.ok(r.interaction.stateId === 'wait' && r.interaction.request.kind === 'farm-select', JSON.stringify(r.interaction)); save('sow-pending', r); return r }
export function sow(s: GameSession, crops: Array<{ row: number; col: number; crop: 'grain' | 'vegetable' | 'wood' }>) { sowStart(s); return ok(s.commitSelectionChoice(0, { crops })) }
export function afterSowHarvest(s: GameSession) { turn(s, 1, 'clay-pit'); turn(s, 0, 'forest'); return finishHarvest(s, confirmNext(s, turn(s, 1, 'reed-bank'))) }
export function mill(config: Parameters<typeof setup>[0] = {}) { return setup({ card: JUNK, resources: { food: 4 }, ...config }) }
export function printedVp(r: SessionResponse, card: string) { assert.ok(r.scores); return r.scores[0]!.categories.find(c => c.key === 'cards')?.entries.filter(e => e.type === 'card' && e.cardId === card).reduce((n, e) => n + e.score, 0) ?? 0 }
export function pellets(config: Parameters<typeof setup>[0] = {}) { return setup({ card: BASKET, round: 14, fields: fields(null, null, null), resources: { food: 4 }, ...config }) }
export function amountPaid(r: SessionResponse, value: string, resource: 'grain' | 'stone') { if (r.interaction.stateId !== 'wait' || r.interaction.request.kind !== 'choice') return undefined; const preview = r.interaction.request.options.find(o => o.value === value)?.effectPreview; return preview?.kind === 'payment' || preview?.kind === 'resourceExchange' ? preview.resourcesPaid?.[resource] : undefined }
