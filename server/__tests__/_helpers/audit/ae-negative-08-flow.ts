// Helpers of ae-negative-08-flow-session.test.ts from the negative audit snapshot fafd4f51b.
import assert from 'node:assert/strict'
import { mkdirSync, writeFileSync } from '../audit-evidence-fs'
import type { GameSession, SessionResponse } from '../../../game/authoritative-session'
import type { PlayerState } from '../../../../shared/contract/types'
import { createWorkSession } from '../session-fixtures'
import { assertRejectedUnchanged, confirmNext, undoRuleSnapshot } from '../negative-rule-audit'

export const WAGE = 'B007_Wage'
export const CREDIT = 'A054_Credit', JUNK = 'A055_JunkRoom', BASKET = 'A056_Basket'
export const BUCK = 'A037_Bucksaw', UPHOLSTERY = 'E031_Upholstery', CULTIVATOR = 'A091_ShiftingCultivator', MUSHROOM = 'A108_MushroomCollector'
export const OCC = ['A125_Priest', 'A124_Knapper', 'A111_WallBuilder', 'A116_WoodCutter']
export const artifactDir = process.env.AGRICOLA_NEGATIVE_ARTIFACT_DIR ?? 'output/ae-negative/flow-oa-artifacts'
export const sessions: GameSession[] = []
export function setup({ card = CREDIT, played = true, round = 14, occupations = [], hand = [], extra = [], resources = {}, opponent = {}, opponentHand = [], stock = 3, noCard = false }: { card?: string; played?: boolean; round?: number; occupations?: string[]; hand?: string[]; extra?: string[]; resources?: Partial<PlayerState['resources']>; opponent?: Partial<PlayerState['resources']>; opponentHand?: string[]; stock?: number; noCard?: boolean } = {}) {
  const s = createWorkSession({ seed: 854, configure: state => {
    state.round = round; state.availableMajorImprovements = card === JUNK ? ['Major_Fireplace1'] : []
    state.players.forEach(p => {
      p.minorHand = ['__test_placeholder__']; p.occupationHand = ['__test_placeholder__']; p.minorPlayed = []; p.occupationPlayed = []; p.improvements = []; p.cardStates = {}
      Object.assign(p.resources, { wood: 0, clay: 0, reed: 0, stone: 0, food: 40, grain: 0, vegetable: 0, sheep: 0, boar: 0, cattle: 0, begging: 0 })
    })
    const p = state.players[0]!
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
export function buy(s: GameSession, card: string) { const r = minorMenu(s, card); return r.state.players[0]!.minorPlayed.includes(card) ? r : choose(s, r, o => o.value === card) }
export function deny(s: GameSession, card: string) { const r = minorMenu(s, card); assert.ok(opts(r).some(o => o.value === WAGE && !('disabled' in o && o.disabled)), JSON.stringify(r.interaction)); assert.equal(opts(r).some(o => o.value === card && !('disabled' in o && o.disabled)), false); assertRejectedUnchanged(s, () => s.resolveChoice(0, card)); assert.equal(s.getState().state.players[0]!.minorPlayed.includes(card), false); const food = r.state.players[0]!.resources.food; const retry = ok(s.resolveChoice(0, WAGE)); resource(retry, 'food', food + 2); assert.equal(retry.state.players[0]!.minorPlayed.includes(card), false) }
export function improve(s: GameSession, card: string, actor = 0) { let r = turn(s, actor, 'major-improvement'); if (r.state.players[actor]!.minorPlayed.includes(card) || r.state.players[actor]!.improvements.includes(card)) return r; if (!opts(r).some(o => o.value === card || o.value === `major:${card}`)) r = choose(s, r, o => o.value.startsWith('action-improvement-')); return choose(s, r, o => o.value === card || o.value === `major:${card}`) }
export function gainCount(r: SessionResponse, card: string) { return r.state.log.filter(e => e.key === 'log.cardEffectGain' && e.params?.cardId === card).length }
export function resource(r: SessionResponse, key: 'food' | 'wood' | 'begging', value: number, actor = 0) { assert.equal(r.state.players[actor]!.resources[key], value) }
export function forest(r: SessionResponse) { return r.state.actionSpaces.find(a => a.id === 'forest')! }
export function endWork(s: GameSession) { turn(s, 0, 'forest'); turn(s, 1, 'clay-pit'); turn(s, 0, 'grain-seeds'); return confirmNext(s, turn(s, 1, 'reed-bank')) }
export function repay(s: GameSession, r: SessionResponse) { if (r.interaction.stateId === 'wait' && r.interaction.sourceCard === CREDIT) { assert.equal(r.interaction.request.kind, 'choice'); assert.ok(r.interaction.request.kind === 'choice'); const payment = r.interaction.request.options.find(o => o.effectPreview?.kind === 'payment' && o.effectPreview.resourcesPaid?.food === 1) ?? r.interaction.request.options[0]; assert.ok(payment); r = ok(s.resolveChoice(0, payment.value)) } return r }
export function finishHarvest(s: GameSession, r: SessionResponse) { for (let n = 0; n < 8 && r.interaction.stateId === 'wait'; n++) { const request = r.interaction.request; if (request.kind === 'feed') r = ok(s.resolveChoice(r.interaction.playerIndex, 'confirm', { selections: [] })); else if (request.kind === 'confirm-player-switch') r = ok(s.resolveChoice(r.interaction.playerIndex, 'confirm')); else if (request.kind === 'confirm-next-player') r = confirmNext(s, r); else if (request.kind === 'choice' && opts(r).some(o => o.value === '__skip__')) r = ok(s.resolveChoice(r.interaction.playerIndex, '__skip__')); else assert.fail(JSON.stringify(r.interaction)) } return r }
export function junk(config: Parameters<typeof setup>[0] = {}) { return setup({ card: JUNK, resources: { food: 0 }, ...config }) }
export function basket(config: Parameters<typeof setup>[0] = {}) { return setup({ card: BASKET, resources: { food: 0 }, ...config }) }
export function accept(s: GameSession, r: SessionResponse) { return choose(s, r, o => o.value !== '__skip__' && o.value !== '__pass__') }
export function source(s: GameSession, r: SessionResponse, card: string) { if (r.interaction.stateId === 'wait' && r.interaction.request.kind === 'select-trigger') r = ok(s.resolveChoice(0, card)); if (r.interaction.stateId === 'wait' && r.interaction.sourceCard === card && r.interaction.request.kind === 'choice') r = accept(s, r); return r }
export function basketFacts(r: SessionResponse, wood: number, food: number, stock: number) { resource(r, 'wood', wood); resource(r, 'food', food); assert.equal(forest(r).resources.wood, stock) }
export function purchaseUndo(before: string, r: SessionResponse) { ok(r); const norm = (v: string) => JSON.parse(v, (key, value: unknown) => key === 'playedCards' ? undefined : value); assert.deepEqual(norm(undoRuleSnapshot(r)), norm(before)); const packet = r.state.publicEventArchive.at(-1); assert.ok(packet?.type === 'publicEvents.canceled' && packet.reason === 'undoAction') }
