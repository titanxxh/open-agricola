// Helpers of ae-negative-06-scoring-session.test.ts from the negative audit snapshot fafd4f51b.
import assert from 'node:assert/strict'
import type { FarmTilePosition, GameState, Resource } from '../../../../shared/contract/types'
import type { GameSession, SessionResponse } from '../../../game/authoritative-session'
import { createWorkSession } from '../session-fixtures'
import { assertRejectedUnchanged } from '../negative-rule-audit'

export const SHEET = 'A030_BakingSheet', DEBT = 'A031_DebtSecurity', MANGER = 'A032_Manger'
export const MAJORS = ['Major_Fireplace1', 'Major_Fireplace2', 'Major_CookingHearth1', 'Major_CookingHearth2']
export const sessions: GameSession[] = []
export function ok(r: SessionResponse) { assert.equal(r.ok, true, r.error); return r }
export function setup(card: string, { played = true, resources = {} }: { played?: boolean; resources?: Partial<Resource> } = {}, configure: (state: GameState) => void = () => {}) {
  const s = createWorkSession({ seed: 4242, configure(state) {
    state.round = 14
    for (const p of state.players) {
      p.minorHand = ['__test_placeholder__']; p.occupationHand = ['__test_placeholder__']
      p.minorPlayed = []; p.occupationPlayed = []; p.improvements = []
      Object.assign(p.resources, { wood: 0, clay: 0, reed: 0, stone: 0, grain: 0, vegetable: 0, food: 20 })
    }
    const p = state.players[0]!
    p.minorHand = played ? ['__test_placeholder__'] : [card, '__test_placeholder__']
    p.minorPlayed = played ? [card] : []
    Object.assign(p.resources, resources); configure(state)
    const owned = state.players.flatMap(p => p.improvements)
    state.availableMajorImprovements = state.availableMajorImprovements.filter(id => !owned.includes(id))
  } }); sessions.push(s); return s
}
export function options(r: SessionResponse) {
  ok(r); assert(r.interaction.stateId === 'wait' && r.interaction.request.kind === 'choice', JSON.stringify(r.interaction))
  return r.interaction.request.options
}
export function buy(s: GameSession, card: string, space = 'meeting-place') {
  let r = ok(s.takeAction(0, space))
  for (let step = 0; step < 3 && !r.state.players[0]!.minorPlayed.includes(card) && !r.state.players[0]!.improvements.includes(card); step++) {
    const candidate = options(r).find(o => o.value === card) ?? options(r).find(o => o.value.startsWith('action-improvement-'))
    assert(candidate && !candidate.disabled, JSON.stringify(r.interaction)); r = ok(s.resolveChoice(0, candidate.value))
  }
  assert(r.state.players[0]!.minorPlayed.includes(card) || r.state.players[0]!.improvements.includes(card)); return r
}
export function denied(s: GameSession, card: string) {
  let r = ok(s.takeAction(0, 'meeting-place'))
  if (r.interaction.stateId === 'wait' && r.interaction.request.kind === 'choice') {
    const branch = r.interaction.request.options.find(o => o.value.startsWith('action-improvement-'))
    if (branch) r = ok(s.resolveChoice(0, branch.value))
  }
  assert(!r.state.players[0]!.minorPlayed.includes(card))
  if (r.interaction.stateId === 'wait' && r.interaction.request.kind === 'choice') assert(!r.interaction.request.options.some(o => o.value === card && !o.disabled))
  assertRejectedUnchanged(s, () => s.resolveChoice(0, card))
}
export function bonus(r: SessionResponse, card: string, owner = 0) {
  assert(r.scores)
  return r.scores[owner]!.categories.find(c => c.key === 'cardBonusVp')?.entries.find(e => e.type === 'bonus' && e.cardId === card)?.score ?? 0
}
export function sheet({ grain = 2, played = true, facility = true } = {}, configure: (state: GameState) => void = () => {}) {
  return setup(SHEET, { played, resources: { grain } }, state => { if (facility) state.players[0]!.improvements = ['Major_Fireplace1']; configure(state) })
}
export function bake(s: GameSession, actor = 0, fireplace = 'Major_Fireplace1') {
  let r = ok(s.takeAction(actor, 'grain-utilization'))
  if (r.interaction.stateId === 'wait' && r.interaction.request.kind === 'choice') {
    const rate = r.interaction.request.options.find(o => o.value === fireplace || o.sourceCard === fireplace)
    if (rate) r = ok(s.resolveChoice(actor, rate.value))
  }
  if (r.interaction.stateId === 'wait' && r.interaction.promptKey === 'ui.interactionBakeBreadCount') {
    const one = options(r).find(o => o.value === `count-${fireplace}-1`); assert(one); r = ok(s.resolveChoice(actor, one.value))
  }
  return r
}
export function sheetMenu(s: GameSession, r: SessionResponse) {
  if (r.interaction.stateId === 'wait' && r.interaction.request.kind === 'select-trigger') {
    const source = r.interaction.request.options.find(o => o.sourceCard === SHEET || o.value === SHEET); assert(source); r = ok(s.resolveChoice(0, source.value))
  }
  assert(r.interaction.stateId === 'wait' && r.interaction.request.kind === 'choice', JSON.stringify(r.interaction)); return r
}
export function acceptSheet(s: GameSession, r: SessionResponse) {
  r = sheetMenu(s, r); const take = options(r).find(o => o.value !== '__skip__'); assert(take); return ok(s.resolveChoice(0, take.value))
}
export const allTiles = Array.from({ length: 15 }, (_, n) => ({ row: Math.floor(n / 5), col: n % 5 }))
export function boundary(cells: FarmTilePosition[]) {
  const edges = new Set<string>()
  for (const { row, col } of cells) for (const edge of [`H-${row}-${col}`, `H-${row + 1}-${col}`, `V-${row}-${col}`, `V-${row}-${col + 1}`]) {
    if (edges.has(edge)) edges.delete(edge); else edges.add(edge)
  }
  return [...edges]
}
export function pastures(state: GameState, groups: FarmTilePosition[][], owner = 0, stable = false, animals = 0) {
  const p = state.players[owner]!; const edges = [...new Set(groups.flatMap(boundary))]; assert(edges.length <= 15)
  p.pastures = groups.map((tiles, i) => ({ id: `p${i}`, tiles, animalType: i === 0 && animals ? 'sheep' : null, animalCount: i === 0 ? animals : 0 }))
  p.fenceSegments = edges.map(edge => ({ edge, type: 'fence', source: { kind: 'own', ownerPlayerId: p.id } }))
  p.stableTiles = stable ? [groups[0]![0]!] : []; p.resources.sheep = animals
}
export function unused(state: GameState, count: number) {
  const p = state.players[0]!; const taken = new Set([...p.roomTiles, ...p.stableTiles, ...p.pastures.flatMap(x => x.tiles)].map(t => `${t.row},${t.col}`))
  const free = allTiles.filter(t => !taken.has(`${t.row},${t.col}`)); p.fields = free.slice(0, 15 - count - taken.size).map(t => ({ ...t, stacks: [] }))
  assert.equal(15 - new Set([...p.roomTiles, ...p.stableTiles, ...p.pastures.flatMap(x => x.tiles), ...p.fields].map(t => `${t.row},${t.col}`)).size, count)
}
export function debt(majors = 2, spaces = 2, configure: (state: GameState) => void = () => {}) {
  return setup(DEBT, {}, state => { state.players[0]!.improvements = MAJORS.slice(0, majors); configure(state); unused(state, spaces) })
}
export function manger(area: number, { played = true, wood = 0 } = {}) {
  return setup(MANGER, { played, resources: { wood } }, state => {
    const p = state.players[0]!
    if (area <= 10) { p.roomTiles = [{ row: 2, col: 0 }, { row: 2, col: 1 }] }
    const cells = area <= 10 ? Array.from({ length: area }, (_, n) => ({ row: Math.floor(n / 5), col: n % 5 })) : Array.from({ length: 12 }, (_, n) => ({ row: Math.floor(n / 4), col: n % 4 + 1 }))
    pastures(state, cells.length ? [cells] : [])
  })
}
