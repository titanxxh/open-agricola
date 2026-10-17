// Helpers of ae-negative-08-income-session.test.ts from the negative audit snapshot fafd4f51b.
import assert from 'node:assert/strict'
import type { GameSession, SessionResponse } from '../../../game/authoritative-session'
import type { GameState, Resource } from '../../../../shared/contract/types'
import { getOwnOrdinaryFenceReserveCount, getStableSupplyLimit } from '../../../../shared/domain/supply-tokens'
import { countUnusedFarmyardSpaces } from '../../../../shared/domain/farm'
import { confirmPlayerSwitch } from '../pending-confirms'
import type { ZoneAssignment } from '../../../../shared/actions/effects/reorganize'
import type { PlayerState } from '../../../../shared/contract/types'
import { createWorkSession } from '../session-fixtures'
import { assertRejectedUnchanged, confirmNext, passPreparationExchanges } from '../negative-rule-audit'

export const NEST = 'A049_NestSite', MILK = 'A050_MilkJug', PARLOR = 'A057_MilkingParlor', YOUNG = 'A009_YoungAnimalMarket'
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
  } }); sessions.push(s); s.withCtx(() => { for (const p of s.state.players) if (p.pastures.length === 2) assert.equal(getOwnOrdinaryFenceReserveCount(p), 5) }); return s
}
export function options(r: SessionResponse) { assert.ok(r.interaction.stateId === 'wait' && (r.interaction.request.kind === 'choice' || r.interaction.request.kind === 'select-trigger'), JSON.stringify(r.interaction)); return r.interaction.request.options }
export function choose(s: GameSession, r: SessionResponse, predicate: (o: { value: string; labelKey?: string }) => boolean) { const o = options(r).find(predicate); assert.ok(o, JSON.stringify(r.interaction)); assert.ok(r.interaction.stateId === 'wait'); return ok(s.resolveChoice(r.interaction.playerIndex, o.value)) }
export function buyMenu(s: GameSession, space = 'meeting-place') { let r = ok(s.takeAction(0, space)); if (r.interaction.stateId === 'wait' && r.interaction.request.kind === 'choice' && r.interaction.request.options.some(o => o.value.startsWith('action-improvement-'))) r = choose(s, r, o => o.value.startsWith('action-improvement-')); return r }
export function buy(s: GameSession, card: string, space = 'meeting-place') { const r = buyMenu(s, space); if (!r.state.players[0]!.minorHand.includes(card)) return r; assert.ok(options(r).some(o => o.value === card && !('disabled' in o && o.disabled))); return ok(s.resolveChoice(0, card)) }
export function deny(s: GameSession, card: string) { const r = buyMenu(s); assert.ok(!r.state.players[0]!.minorPlayed.includes(card)); assertRejectedUnchanged(s, () => s.resolveChoice(0, card)) }
export function ready(s: GameSession, actor: number) { let r = s.getState(); if (r.interaction.stateId === 'wait' && r.interaction.request.kind === 'confirm-next-player') r = confirmNext(s, r); assert.equal(r.interaction.stateId, 'idle', JSON.stringify(r.interaction)); assert.equal(r.state.currentPlayerIndex, actor); return r }
export function turn(s: GameSession, actor: number, space: string) { ready(s, actor); return ok(s.takeAction(actor, space)) }
export function food(r: SessionResponse) { return r.state.players.map(p => p.resources.food) }
export function bank(r: SessionResponse) { return r.state.actionSpaces.find(a => a.id === 'reed-bank')!.resources.reed }
export function nest() { return setup(NEST, { occupations: 1, resources: { food: 40 } }, state => { state.actionSpaces.find(a => a.id === 'reed-bank')!.resources.reed = 1 }) }
export function finish(s: GameSession, ownFirst: string, otherFirst = 'forest', ownSecond = 'grain-seeds', otherSecond = 'clay-pit') {
  const r = turn(s, 0, ownFirst); if (r.interaction.stateId === 'wait' && r.interaction.request.kind === 'choice') { const skip = r.interaction.request.options.find(o => o.value === '__skip__'); assert.ok(skip, JSON.stringify(r.interaction)); ok(s.resolveChoice(0, skip.value)) } turn(s, 1, otherFirst); turn(s, 0, ownSecond); return passPreparationExchanges(s, confirmNext(s, turn(s, 1, otherSecond)))
}
export function housing(p: PlayerState, sheep = 0, cattle = 0, unused = 4) {
  p.resources.sheep = sheep; p.resources.cattle = cattle
  p.pastures = [{ id: `sheep-${p.id}`, tiles: [{ row: 0, col: 3 }, { row: 1, col: 3 }], animalType: sheep ? 'sheep' : null, animalCount: sheep }, { id: `cattle-${p.id}`, tiles: [{ row: 0, col: 4 }, { row: 1, col: 4 }], animalType: cattle ? 'cattle' : null, animalCount: cattle }]
  p.fenceSegments = ['H-0-3', 'H-2-3', 'H-0-4', 'H-2-4', 'V-0-3', 'V-1-3', 'V-0-4', 'V-1-4', 'V-0-5', 'V-1-5'].map(edge => ({ edge, type: 'fence', source: { kind: 'own', ownerPlayerId: p.id } }))
  p.stableTiles = [{ row: 0, col: 3 }, { row: 0, col: 4 }]
  const connected = [{ row: 0, col: 1 }, { row: 0, col: 2 }, { row: 1, col: 1 }, { row: 1, col: 2 }, { row: 2, col: 2 }, { row: 2, col: 1 }]
  p.fields = connected.slice(0, 9 - unused).map(t => ({ ...t, stacks: [] }))
  assert.equal(getStableSupplyLimit(p) - p.stableTiles.length, 2); assert.equal(countUnusedFarmyardSpaces(p), unused); const used = new Set([...p.roomTiles, ...p.fields, ...p.stableTiles, ...p.pastures.flatMap(pasture => pasture.tiles)].map(t => `${t.row},${t.col}`)); assert.equal(used.size, 15 - unused)
}
export function milk({ played = false, sheep = 0, young = false } = {}) { return setup(MILK, { round: 14, played, occupations: 0, resources: { clay: 1 } }, state => {
  for (const p of state.players) housing(p, p === state.players[0] ? sheep : 0, 0, 5)
  state.actionSpaces.find(a => a.id === 'cattle-market')!.resources.cattle = 1; state.actionSpaces.find(a => a.id === 'sheep-market')!.resources.sheep = 1
  if (young) state.players[0]!.minorHand.push(YOUNG)
}) }
export function settle(s: GameSession, r: SessionResponse, actor: number) {
  for (let n = 0; n < 12 && r.interaction.stateId === 'wait'; n++) {
    if (r.interaction.request.kind === 'confirm-player-switch') { r = ok(confirmPlayerSwitch(s)); continue }
    if (r.interaction.request.kind !== 'animal-reorg') break
    const p = r.state.players[actor]!, assignments: ZoneAssignment[] = []
    if (p.resources.sheep) assignments.push({ id: `sheep-${p.id}`, zoneType: 'pasture', animalType: 'sheep', animalCount: p.resources.sheep })
    if (p.resources.cattle) assignments.push({ id: `cattle-${p.id}`, zoneType: 'pasture', animalType: 'cattle', animalCount: p.resources.cattle })
    r = ok(s.resolveChoice(actor, 'confirm', { zones: assignments }))
  }
  assert.ok(r.interaction.stateId === 'wait' && r.interaction.request.kind === 'confirm-next-player', JSON.stringify(r.interaction)); return r
}
export function parlor({ sheep = 0, cattle = 0, unused = 4, wood = 2, fireplace = false, opponent = false } = {}) { return setup(PARLOR, { round: 14, occupations: 0, resources: { wood } }, state => {
  housing(state.players[0]!, opponent ? 0 : sheep, opponent ? 0 : cattle, unused)
  if (opponent) housing(state.players[1]!, sheep, cattle)
  if (fireplace) { state.players[0]!.improvements = ['Major_Fireplace1']; state.availableMajorImprovements = state.availableMajorImprovements.filter(id => id !== 'Major_Fireplace1') }
}) }
export function printed(r: SessionResponse) { assert.ok(r.scores); assert.ok(r.scores[0]); return r.scores[0].categories.find(c => c.key === 'cards')?.entries.find(e => e.type === 'card' && e.cardId === PARLOR)?.score ?? 0 }
export function cookSheep(s: GameSession, amount: number) {
  const r = ok(s.takeAnytimeAction(0, 'exchange')); assert.ok(r.interaction.stateId === 'wait' && r.interaction.request.kind === 'choice', JSON.stringify(r.interaction)); const exchange = r.interaction.request.options.find(o => o.effectPreview?.kind === 'resourceExchange' && o.effectPreview.resourcesPaid?.sheep === amount); assert.ok(exchange, JSON.stringify(r.interaction)); assert.ok(exchange.value.startsWith('trade:')); return ok(s.resolveChoice(0, `bulk:${exchange.value.split(':')[1]}=${amount}`))
}
