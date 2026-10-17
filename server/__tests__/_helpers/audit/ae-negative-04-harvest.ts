// Helpers of ae-negative-04-harvest-session.test.ts from the negative audit snapshot fafd4f51b.
import assert from 'node:assert/strict'
import type { GameState } from '../../../../shared/contract/types'
import type { GameSession, SessionResponse } from '../../../game/authoritative-session'
import { createWorkSession } from '../session-fixtures'
import { assertRejectedUnchanged, confirmNext } from '../negative-rule-audit'
import { markAllWorkersUsed } from '../../../../shared/domain/player'

export const CHAMBER = 'D035_FodderChamber', PLANTER = 'D115_FodderPlanter', BEETS = 'E044_FodderBeets'
export type FarmAnimal = 'sheep' | 'boar' | 'cattle'
export const sessions: GameSession[] = []
export function ok(r: SessionResponse) { assert.equal(r.ok, true, r.error); return r }
export function setup(card: string, configure: (state: GameState) => void = () => {}, players = 2) {
  const s = createWorkSession({ seed: 4242, options: { playerCount: players }, configure(state) {
    state.round = 4
    for (const p of state.players) Object.assign(p.resources, { wood: 0, clay: 0, reed: 0, stone: 0, grain: 0, vegetable: 0, food: 20 })
    const p = state.players[0]!
    if (card === PLANTER) p.occupationPlayed = [card]
    else p.minorHand = [card]
    configure(state)
  } })
  sessions.push(s); return s
}
export function options(r: SessionResponse) {
  ok(r); assert(r.interaction.stateId === 'wait' && r.interaction.request.kind === 'choice', JSON.stringify(r.interaction))
  return r.interaction.request.options
}
export function minorMenu(s: GameSession) {
  let r = ok(s.takeAction(0, 'meeting-place'))
  if (r.interaction.stateId === 'wait' && r.interaction.request.kind === 'choice') {
    const branch = r.interaction.request.options.find(o => o.value.startsWith('action-improvement-'))
    if (branch) r = ok(s.resolveChoice(0, branch.value))
  }
  return r
}
export function buy(s: GameSession, card: string) {
  const menu = minorMenu(s)
  if (menu.state.players[0]!.minorPlayed.includes(card)) return menu
  assert(options(menu).some(o => o.value === card && !o.disabled))
  return ok(s.resolveChoice(0, card))
}
export function deniedBuy(s: GameSession, card: string) {
  const menu = minorMenu(s)
  assert(!JSON.stringify(menu.interaction).includes(`"value":"${card}"`))
  assertRejectedUnchanged(s, () => s.resolveChoice(0, card))
  assert(s.state.players[0]!.minorHand.includes(card))
}
export function score(r: SessionResponse, card = CHAMBER, owner = 0) {
  assert(r.scores)
  return r.scores[owner]!.categories.find(c => c.key === 'cardBonusVp')?.entries.find(e => e.type === 'bonus' && e.cardId === card)?.score ?? 0
}
export function houseSheep(state: GameState, count: number, owner = 0) {
  const p = state.players[owner]!
  p.resources.sheep = count
  p.pastures = [{ id: 'large', tiles: [0, 1].flatMap(row => [1, 2, 3, 4].map(col => ({ row, col }))), animalType: 'sheep', animalCount: count }]
  p.stableTiles = [{ row: 0, col: 1 }]
  const edges = [...[1, 2, 3, 4].flatMap(col => [`H-0-${col}`, `H-2-${col}`]), ...[0, 1].flatMap(row => [`V-${row}-1`, `V-${row}-5`])]
  p.fenceSegments = edges.map(edge => ({ edge, type: 'fence', source: { kind: 'own', ownerPlayerId: p.id } }))
}
export function nursery({ species = ['sheep'], grain = 3, vegetable = 0, stable = true, fields = 3, played = true }:
  { species?: FarmAnimal[]; grain?: number; vegetable?: number; stable?: boolean; fields?: number; played?: boolean } = {}) {
  return setup(PLANTER, state => {
    const p = state.players[0]!
    if (!played) { p.occupationPlayed = []; p.occupationHand = [PLANTER] }
    Object.assign(p.resources, { grain, vegetable, wood: 3 })
    p.fields = Array.from({ length: fields }, (_, i) => ({ row: 1, col: i + 1, stacks: [] }))
    p.fenceSegments = []
    species.forEach((animalType, i) => {
      const col = 1 + i * 2
      p.resources[animalType] = 2
      p.pastures.push({ id: animalType, tiles: [{ row: 0, col }], animalType, animalCount: 2 })
      if (stable) p.stableTiles.push({ row: 0, col })
      for (const edge of [`H-0-${col}`, `H-1-${col}`, `V-0-${col}`, `V-0-${col + 1}`]) p.fenceSegments.push({ edge, type: 'fence', source: { kind: 'own', ownerPlayerId: p.id } })
    })
    if (!stable) { p.houseAnimals = { '2-0': 'cattle' }; p.resources.cattle = 1 }
  })
}
export function breeding(s: GameSession) {
  for (const p of s.state.players) markAllWorkersUsed(s.state, p)
  const r = ok(s.performRoundEnd())
  assert(r.interaction.stateId === 'wait' && r.interaction.request.kind === 'animal-reorg', JSON.stringify(r.interaction))
  return r
}
export function arrange(s: GameSession, sheep = 3, boar = 0, houseCattle = false) {
  const zones = [{ id: 'sheep', zoneType: 'pasture', animalType: 'sheep', animalCount: sheep }]
  if (boar) zones.push({ id: 'boar', zoneType: 'pasture', animalType: 'boar', animalCount: boar })
  if (houseCattle) zones.push({ id: 'house:2-0', zoneType: 'house', animalType: 'cattle', animalCount: 1 })
  return ok(s.resolveChoice(0, 'confirm', { zones }))
}
export function sowMenu(s: GameSession, r: SessionResponse, max: number) {
  assert(r.interaction.stateId === 'wait' && r.interaction.promptKey === 'ui.interactionFodderPlanterSow')
  const take = options(r).find(o => o.value !== '__skip__'); assert(take)
  r = ok(s.resolveChoice(0, take.value))
  assert(r.interaction.stateId === 'wait' && r.interaction.request.kind === 'farm-select' && r.interaction.request.farm.farmType === 'sow')
  assert.equal(r.interaction.request.farm.maxSelections, max)
  return r
}
export function fields(state: GameState, count: number) { state.players[0]!.fields = Array.from({ length: count }, (_, i) => ({ row: 0, col: i + 1, stacks: [] })) }
export function future(r: SessionResponse) { return r.state.futureMeeples.filter(m => m.cardId === BEETS).map(m => ({ round: m.round, resources: m.resources })) }
export function naturalTurn(s: GameSession, index: number, space: string) { return confirmNext(s, ok(s.takeAction(index, space))) }
