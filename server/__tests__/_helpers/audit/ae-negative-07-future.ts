// Helpers of ae-negative-07-future-session.test.ts from the negative audit snapshot fafd4f51b.
import assert from 'node:assert/strict'
import type { GameSession, SessionResponse } from '../../../game/authoritative-session'
import type { GameState, Resource } from '../../../../shared/contract/types'
import { getOwnOrdinaryFenceReserveCount } from '../../../../shared/domain/supply-tokens'
import { createWorkSession } from '../session-fixtures'
import { assertRejectedUnchanged, confirmNext, undoRuleSnapshot } from '../negative-rule-audit'

export const HUT = 'A044_PondHut', POND = 'A045_FireProtectionPond', TRELLIS = 'A047_Trellises'
export const sessions: GameSession[] = []
export function ok(r: SessionResponse) { assert.equal(r.ok, true, r.error); return r }
export function setup(card: string, { round = 5, played = false, occupations = 2, resources = {} }: { round?: number; played?: boolean; occupations?: number; resources?: Partial<Resource> } = {}, configure: (state: GameState) => void = () => {}) {
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
export function buyMenu(s: GameSession) { let r = ok(s.takeAction(0, 'meeting-place')); if (r.interaction.stateId === 'wait' && r.interaction.request.kind === 'choice' && r.interaction.request.options.some(o => o.value.startsWith('action-improvement-'))) r = choose(s, r, o => o.value.startsWith('action-improvement-')); return r }
export function buy(s: GameSession, card: string) { const r = buyMenu(s); if (r.state.players[0]!.minorPlayed.includes(card)) return r; assert.ok(options(r).some(o => o.value === card && !('disabled' in o && o.disabled))); return ok(s.resolveChoice(0, card)) }
export function deny(s: GameSession, card: string) { const r = buyMenu(s); assert.ok(!r.state.players[0]!.minorPlayed.includes(card)); assertRejectedUnchanged(s, () => s.resolveChoice(0, card)) }
export function ready(s: GameSession, actor: number) { let r = s.getState(); if (r.interaction.stateId === 'wait' && r.interaction.request.kind === 'confirm-next-player') r = confirmNext(s, r); assert.equal(r.interaction.stateId, 'idle', JSON.stringify(r.interaction)); assert.equal(r.state.currentPlayerIndex, actor); return r }
export function turn(s: GameSession, actor: number, space: string) { ready(s, actor); return ok(s.takeAction(actor, space)) }
export function rounds(r: SessionResponse, card: string) { const entries = r.state.futureMeeples.filter(e => e.cardId === card); for (const e of entries) { assert.equal(e.playerId, r.state.players[0]!.id); assert.deepEqual(e.resources, { food: 1 }) } return entries.map(e => e.round).sort((a, b) => a - b) }
export function complete(s: GameSession, firstRound = false) {
  if (firstRound) { turn(s, 1, 'forest'); turn(s, 0, 'grain-seeds'); return confirmNext(s, turn(s, 1, 'clay-pit')) }
  turn(s, 0, 'reed-bank'); turn(s, 1, 'forest'); turn(s, 0, 'grain-seeds'); return confirmNext(s, turn(s, 1, 'clay-pit'))
}
export function food(r: SessionResponse) { return r.state.players.map(p => p.resources.food) }
export function terrainNormalizedSnapshot(r: SessionResponse) { const players = r.state.players.map(p => { if (p.farmTerrain?.length !== 0) return p; const { farmTerrain: _emptyTerrain, ...player } = p; return player }); return undoRuleSnapshot({ ...r, state: { ...r.state, players } }) }
export function assertTerrainNormalizedUndo(before: string, r: SessionResponse) { ok(r); assert.deepEqual(JSON.parse(terrainNormalizedSnapshot(r)), JSON.parse(before)); const packet = r.state.publicEventArchive.at(-1); assert.ok(packet?.type === 'publicEvents.canceled'); assert.equal(packet.reason, 'undoAction') }
export function printedVp(r: SessionResponse, card: string) { assert.ok(r.scores); assert.ok(r.scores[0]); return r.scores[0].categories.find(c => c.key === 'cards')?.entries.find(e => e.type === 'card' && e.cardId === card)?.score ?? 0 }
export function renovationSetup({ round = 5, played = true, clay = 2, reed = 2, stone = 2 } = {}, configure: (state: GameState) => void = () => {}) { return setup(POND, { round, played, resources: { clay, reed, stone } }, configure) }
export function renovate(s: GameSession, actor = 0) {
  let r = turn(s, actor, 'house-redevelopment')
  for (let n = 0; n < 8 && r.interaction.stateId === 'wait'; n++) {
    if (r.interaction.request.kind === 'confirm-next-player') break
    const opts = options(r); const target = r.state.players[actor]!.houseType === 'wood' ? 'clay' : 'stone'
    const o = opts.find(o => o.value === target) ?? opts.find(o => o.value === '__skip__' || o.value === 'skip'); assert.ok(o, JSON.stringify(r.interaction)); r = ok(s.resolveChoice(r.interaction.playerIndex, o.value))
  }
  return r
}
export const cellOne = ['H-0-1', 'H-1-1', 'V-0-1', 'V-0-2'], cellTwo = ['H-0-2', 'H-1-2', 'V-0-3']
export function fence(s: GameSession, edges = cellOne, actor = 0) { const r = turn(s, actor, 'fencing'); assert.ok(r.interaction.stateId === 'wait' && r.interaction.request.kind === 'farm-select'); return ok(s.commitSelectionChoice(actor, { edges })) }
export function fencedPurchase(s: GameSession) { const r = fence(s); assert.equal(r.state.players[0]!.fenceSegments.length, 4); assert.equal(s.withCtx(() => getOwnOrdinaryFenceReserveCount(r.state.players[0]!)), 11); turn(s, 1, 'forest'); ready(s, 0); return buy(s, TRELLIS) }
