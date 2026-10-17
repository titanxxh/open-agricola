// Helpers of ae-negative-06-future-session.test.ts from the negative audit snapshot fafd4f51b.
import assert from 'node:assert/strict'
import type { GameSession, SessionResponse } from '../../../game/authoritative-session'
import type { GameState, Resource } from '../../../../shared/contract/types'
import { getAllTilePositions, positionKey } from '../../../../shared/domain/farm'
import { familySize, newbornCount } from '../../../../shared/domain/player'
import { createWorkSession } from '../session-fixtures'
import { assertRejectedUnchanged, confirmNext } from '../negative-rule-audit'

export const BIG = 'A033_BigCountry', LOPPERS = 'A034_Loppers', SWIM = 'A035_SwimmingClass'
export const sessions: GameSession[] = []
export function ok(r: SessionResponse) { assert.equal(r.ok, true, r.error); return r }
export function setup(card: string, { round = 14, played = false, occupations = 2, resources = {} }: { round?: number; played?: boolean; occupations?: number; resources?: Partial<Resource> } = {}, configure: (state: GameState) => void = () => {}) {
  const s = createWorkSession({ seed: 42, options: { playerCount: 2 }, configure(state) {
    state.round = round; state.availableMajorImprovements = []
    for (const p of state.players) Object.assign(p.resources, { food: 40, wood: 0, clay: 0, reed: 0, stone: 0, grain: 0, vegetable: 0 })
    const p = state.players[0]!
    p.minorHand = played ? ['__test_placeholder__'] : [card, '__test_placeholder__']; p.minorPlayed = played ? [card] : []
    p.occupationPlayed = ['D115_FodderPlanter', 'A111_WallBuilder'].slice(0, occupations)
    Object.assign(p.resources, resources); configure(state)
  } }); sessions.push(s); return s
}
export function options(r: SessionResponse) { assert.ok(r.interaction.stateId === 'wait' && (r.interaction.request.kind === 'choice' || r.interaction.request.kind === 'select-trigger'), JSON.stringify(r.interaction)); return r.interaction.request.options }
export function choose(s: GameSession, r: SessionResponse, predicate: (o: { value: string; labelKey?: string }) => boolean) { const o = options(r).find(predicate); assert.ok(o, JSON.stringify(r.interaction)); assert.ok(r.interaction.stateId === 'wait'); return ok(s.resolveChoice(r.interaction.playerIndex, o.value)) }
export function buyMenu(s: GameSession) { let r = ok(s.takeAction(0, 'meeting-place')); if (r.interaction.stateId === 'wait' && r.interaction.request.kind === 'choice' && r.interaction.request.options.some(o => o.value.startsWith('action-improvement-'))) r = choose(s, r, o => o.value.startsWith('action-improvement-')); return r }
export function buy(s: GameSession, card: string) { const r = buyMenu(s); if (r.state.players[0]!.minorPlayed.includes(card)) return r; assert.ok(options(r).some(o => o.value === card && !('disabled' in o && o.disabled))); return ok(s.resolveChoice(0, card)) }
export function deny(s: GameSession, card: string) { const r = buyMenu(s); assert.ok(!r.state.players[0]!.minorPlayed.includes(card)); assertRejectedUnchanged(s, () => s.resolveChoice(0, card)) }
export function score(r: SessionResponse, card: string) { assert.ok(r.scores); assert.ok(r.scores[0]); return r.scores[0].categories.find(c => c.key === 'cardBonusVp')?.entries.find(e => e.type === 'bonus' && e.cardId === card)?.score ?? 0 }
export function vp(r: SessionResponse, card: string) { return r.state.players[0]!.cardStates[card]?.counters?.bonusVp ?? 0 }
export function ready(s: GameSession, actor: number) { let r = s.getState(); if (r.interaction.stateId === 'wait' && r.interaction.request.kind === 'confirm-next-player') r = confirmNext(s, r); assert.equal(r.interaction.stateId, 'idle', JSON.stringify(r.interaction)); assert.equal(r.state.currentPlayerIndex, actor); return r }
export function turn(s: GameSession, actor: number, space: string) { ready(s, actor); return ok(s.takeAction(actor, space)) }
export function fullFarm(state: GameState, unused = 0, stable = false) {
  const p = state.players[0]!; const occupied = new Set(p.roomTiles.map(positionKey)); const free = getAllTilePositions().filter(t => !occupied.has(positionKey(t)))
  p.fields = free.slice(0, 13 - unused - Number(stable)).map(t => ({ ...t, stacks: [] }))
  if (stable) p.stableTiles = [free.at(-1)!]
}
export function nearFenceLimit(state: GameState, placed: 13 | 14) {
  const p = state.players[0]!
  const edges = [...[1, 2, 3, 4].flatMap(col => [`H-0-${col}`, `H-1-${col}`]), 'V-0-1', 'V-0-5', 'H-2-4', 'V-1-4', 'V-1-5']
  if (placed === 14) edges.push('V-0-3')
  p.fenceSegments = edges.map(edge => ({ edge, type: 'fence', source: { kind: 'own', ownerPlayerId: p.id } }))
  const top = placed === 13 ? [[1, 2, 3, 4]] : [[1, 2], [3, 4]]
  p.pastures = [...top.map((cols, i) => ({ id: `top-${i}`, tiles: cols.map(col => ({ row: 0, col })), animalType: null, animalCount: 0 })), { id: 'bottom', tiles: [{ row: 1, col: 4 }], animalType: null, animalCount: 0 }]
  assert.equal(p.fenceSegments.length, placed)
}
export const oneCell = ['H-0-1', 'H-1-1', 'V-0-1', 'V-0-2']
export function fence(s: GameSession, edges = oneCell, actor = 0) {
  const r = turn(s, actor, 'fencing'); assert.ok(r.interaction.stateId === 'wait' && r.interaction.request.kind === 'farm-select')
  return ok(s.commitSelectionChoice(actor, { edges }))
}
export function exchange(s: GameSession, r: SessionResponse, accept: boolean) {
  const values: string[] = []
  for (let n = 0; n < 8 && r.interaction.stateId === 'wait'; n++) {
    if (r.interaction.request.kind === 'select-trigger') {
      const o = r.interaction.request.options.find(o => o.value === LOPPERS && !('disabled' in o && o.disabled))
      const value = o ? o.value : '__pass__'; values.push(value); r = ok(s.resolveChoice(r.interaction.playerIndex, value)); continue
    }
    if (r.interaction.request.kind !== 'choice') break
    const o = r.interaction.request.options.find(o => accept ? o.value !== '__skip__' && !('disabled' in o && o.disabled) : o.value === '__skip__'); assert.ok(o, JSON.stringify(r.interaction))
    values.push(o.value); r = ok(s.resolveChoice(r.interaction.playerIndex, o.value))
  }
  return { r, values }
}
export function swimSetup() { return setup(SWIM, { round: 5, played: true }, state => { const p = state.players[0]!; p.rooms = 3; p.roomTiles.push({ row: 2, col: 0 }) }) }
export function roundWithGrowth(s: GameSession, ownFirst = 'fishing', otherFirst = 'forest') {
  turn(s, 0, ownFirst); turn(s, 1, otherFirst)
  const grown = turn(s, 0, 'wish-children'); assert.equal(familySize(grown.state.players[0]!), 3); assert.equal(newbornCount(grown.state.players[0]!), 1); assert.equal(vp(grown, SWIM), 0)
  const last = turn(s, 1, 'clay-pit'); assert.equal(vp(last, SWIM), 0)
  return confirmNext(s, last)
}
