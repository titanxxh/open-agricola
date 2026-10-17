// Helpers of ae-negative-10-accumulation-session.test.ts from the negative audit snapshot fafd4f51b.
import assert from 'node:assert/strict'
import { mkdirSync, writeFileSync } from '../audit-evidence-fs'
import type { GameSession, SessionResponse } from '../../../game/authoritative-session'
import type { PlayerState } from '../../../../shared/contract/types'
import type { ZoneAssignment } from '../../../../shared/actions/effects/reorganize'
import { createWorkSession } from '../session-fixtures'
import { assertRejectedUnchanged, confirmNext, undoRuleSnapshot } from '../negative-rule-audit'
import { getAvailableStableSupplyCount, getOwnOrdinaryFenceReserveCount } from '../../../../shared/domain/supply-tokens'
import { workersAtHome } from '../../../../shared/domain/player'

export const HOD = 'A077_Hod', CANOE = 'A078_Canoe', TONGS = 'A080_StoneTongs', EXCURSION = 'B006_ExcursiontotheQuarry', WAGE = 'B007_Wage'
export const artifactDir = process.env.AGRICOLA_NEGATIVE_ARTIFACT_DIR ?? 'output/ae-negative/10-accumulation-oa-artifacts'
export let serial = 0
export const sessions: GameSession[] = []
export function save(name: string, value: unknown) { mkdirSync(artifactDir, { recursive: true }); writeFileSync(`${artifactDir}/${name}-${++serial}.json`, JSON.stringify(value, null, 2)) }
export function setup({ card = HOD, played = true, resources = {}, occupations = [], hand = [], pig = 1, fishing = 2, quarry = 1 }: { card?: string; played?: boolean; resources?: Partial<PlayerState['resources']>; occupations?: string[]; hand?: string[]; pig?: number; fishing?: number; quarry?: number } = {}) {
  const s = createWorkSession({ seed: 1077, configure: state => {
    state.round = 14; state.availableMajorImprovements = []
    for (const p of state.players) { p.minorHand = ['__test_placeholder__']; p.occupationHand = ['__test_placeholder__']; p.minorPlayed = []; p.occupationPlayed = []; p.improvements = []; p.cardStates = {}; Object.assign(p.resources, { wood: 0, clay: 0, reed: 0, stone: 0, grain: 0, vegetable: 0, sheep: 0, boar: 0, cattle: 0, food: 40, begging: 0 }); if (card === HOD) { p.fenceSegments = ['H-0-1', 'H-1-1', 'V-0-1', 'V-0-2'].map(edge => ({ edge, type: 'fence', source: { kind: 'own', ownerPlayerId: p.id } })); p.pastures = [{ id: `accum-${p.id}`, tiles: [{ row: 0, col: 1 }], animalType: null, animalCount: 0 }]; p.stableTiles = [{ row: 0, col: 1 }] } }
    const owner = state.players[0]!; owner.minorHand = [...(!played ? [card, WAGE, 'A016_RammedClay'] : []), ...hand, '__test_placeholder__']; owner.minorPlayed = played ? [card] : []; owner.occupationPlayed = occupations; Object.assign(owner.resources, resources)
    for (const [id, type, count] of [['pig-market', 'boar', pig], ['sheep-market', 'sheep', 1], ['cattle-market', 'cattle', 1], ['fishing', 'food', fishing], ['eastern-quarry', 'stone', quarry], ['western-quarry', 'stone', quarry]] satisfies Array<[string, keyof PlayerState['resources'], number]>) state.actionSpaces.find(a => a.id === id)!.resources[type] = count
    state.actionSpaces.find(a => a.id === 'forest')!.resources.wood = 3
  } }); sessions.push(s); for (const p of s.state.players) { assert.equal(p.workers.length, 5); assert.equal(workersAtHome(s.state, p).length, 2); assert.equal(s.withCtx(() => getOwnOrdinaryFenceReserveCount(p)), card === HOD ? 11 : 15); assert.equal(s.withCtx(() => getAvailableStableSupplyCount(s.state, p)), card === HOD ? 3 : 4) } return s
}
export function ok(r: SessionResponse) { assert.equal(r.ok, true, r.error); return r }
export function opts(r: SessionResponse) { assert.ok(r.interaction.stateId === 'wait' && r.interaction.request.kind === 'choice', JSON.stringify(r.interaction)); return r.interaction.request.options }
export function ready(s: GameSession, actor: number) { let r = s.getState(); if (r.interaction.stateId === 'wait' && r.interaction.request.kind === 'confirm-next-player') r = confirmNext(s, r); assert.equal(r.interaction.stateId, 'idle', JSON.stringify(r.interaction)); assert.equal(r.state.currentPlayerIndex, actor); return r }
export function turn(s: GameSession, actor: number, space: string) { const before = ready(s, actor), r = ok(s.takeAction(actor, space)); save('take-action', { command: 'takeAction', actor, space, before, response: r }); return r }
export function choose(s: GameSession, r: SessionResponse, value: string) { return ok(s.resolveChoice(r.interaction.stateId === 'wait' ? r.interaction.playerIndex : 0, value)) }
export function menu(s: GameSession) { let r = turn(s, 0, 'meeting-place'); if (r.interaction.stateId === 'wait' && r.interaction.request.kind === 'choice') { const o = r.interaction.request.options.find(o => o.value.startsWith('action-improvement-')); if (o) r = choose(s, r, o.value) } save('minor-menu', r); return r }
export function buy(s: GameSession, card: string) { const r = menu(s); assert.ok(opts(r).some(o => o.value === card && !o.disabled)); const bought = choose(s, r, card); save('actual-purchase', { before: r, card, response: bought }); return bought }
export function deny(s: GameSession, card: string) { const r = menu(s); assert.equal(opts(r).some(o => o.value === card && !o.disabled), false); const denied = assertRejectedUnchanged(s, () => s.resolveChoice(0, card)); save('rejected-native-card', { before: r, card, response: denied }); const food = r.state.players[0]!.resources.food; const retry = choose(s, r, WAGE); assert.equal(retry.state.players[0]!.resources.food, food + 2); assert.equal(retry.state.players[0]!.minorPlayed.includes(card), false); save('legal-original-pending-retry', retry) }
export function gainCount(r: SessionResponse, card: string) { return r.state.log.filter(e => e.key === 'log.cardEffectGain' && e.params?.cardId === card).length }
export function settle(s: GameSession, r: SessionResponse, actor: number, animal: 'sheep' | 'boar' | 'cattle') { if (r.interaction.stateId === 'wait' && r.interaction.request.kind === 'animal-reorg') { const count = r.state.players[actor]!.resources[animal]; const zones: ZoneAssignment[] = [{ id: `accum-${r.state.players[actor]!.id}`, zoneType: 'pasture', animalType: animal, animalCount: count }]; const input = r; r = ok(s.resolveChoice(actor, 'confirm', { zones })); save('animal-reorg', { actor, zones, before: input, response: r }) } assert.ok(r.interaction.stateId === 'wait' && r.interaction.request.kind === 'confirm-next-player', JSON.stringify(r.interaction)); return r }
export function market(s: GameSession, actor = 0, space = 'pig-market', animal: 'sheep' | 'boar' | 'cattle' = 'boar') { return settle(s, turn(s, actor, space), actor, animal) }
export function purchaseUndo(s: GameSession, before: string) { const r = ok(s.undoAction()); const normalize = (v: string) => JSON.parse(v, (key, value: unknown) => key === 'playedCards' ? undefined : value); assert.deepEqual(normalize(undoRuleSnapshot(r)), normalize(before)); const packet = r.state.publicEventArchive.at(-1); assert.ok(packet?.type === 'publicEvents.canceled' && packet.reason === 'undoAction'); save('purchase-undo', r) }
export function printedVp(r: SessionResponse, card: string) { assert.ok(r.scores); return r.scores[0]!.categories.find(c => c.key === 'cards')?.entries.filter(e => e.type === 'card' && e.cardId === card).reduce((sum, e) => sum + e.score, 0) ?? 0 }
export function canoe(config: Parameters<typeof setup>[0] = {}) { return setup({ card: CANOE, occupations: ['A124_Knapper'], ...config }) }
export function tongs(config: Parameters<typeof setup>[0] = {}) { return setup({ card: TONGS, ...config }) }
