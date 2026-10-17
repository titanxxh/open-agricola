// Helpers of ae-negative-07-scoring-session.test.ts from the negative audit snapshot fafd4f51b.
import assert from 'node:assert/strict'
import type { GameState, Resource } from '../../../../shared/contract/types'
import type { GameSession, SessionResponse } from '../../../game/authoritative-session'
import { createWorkSession } from '../session-fixtures'
import { assertRejectedUnchanged } from '../negative-rule-audit'

export const FACADES = 'A036_FacadesCarving', SAW = 'A037_Bucksaw', WOOL = 'A038_WoolBlankets'
export const sessions: GameSession[] = []
export function ok(r: SessionResponse) { assert.equal(r.ok, true, r.error); return r }
export function setup(card: string, { played = true, round = 14, resources = {} }: { played?: boolean; round?: number; resources?: Partial<Resource> } = {}, configure: (state: GameState) => void = () => {}) {
  const s = createWorkSession({ seed: 4242, configure(state) {
    state.round = round
    for (const p of state.players) {
      p.minorHand = ['__test_placeholder__']; p.occupationHand = ['__test_placeholder__']
      p.minorPlayed = []; p.occupationPlayed = []; p.improvements = []
      Object.assign(p.resources, { wood: 0, clay: 0, reed: 0, stone: 0, grain: 0, vegetable: 0, sheep: 0, food: 20 })
    }
    const p = state.players[0]!; p.minorHand = played ? ['__test_placeholder__'] : [card, '__test_placeholder__']; p.minorPlayed = played ? [card] : []
    Object.assign(p.resources, resources); configure(state)
    const owned = state.players.flatMap(p => p.improvements); state.availableMajorImprovements = state.availableMajorImprovements.filter(id => !owned.includes(id))
  } }); sessions.push(s); return s
}
export function options(r: SessionResponse) { ok(r); assert(r.interaction.stateId === 'wait' && r.interaction.request.kind === 'choice', JSON.stringify(r.interaction)); return r.interaction.request.options }
export function buy(s: GameSession, card: string) {
  let r = ok(s.takeAction(0, 'meeting-place'))
  for (let i = 0; i < 3 && !r.state.players[0]!.minorPlayed.includes(card); i++) {
    const candidate = options(r).find(o => o.value === card) ?? options(r).find(o => o.value.startsWith('action-improvement-')); assert(candidate && !candidate.disabled, JSON.stringify(r.interaction)); r = ok(s.resolveChoice(0, candidate.value))
  }
  assert(r.state.players[0]!.minorPlayed.includes(card)); return r
}
export function denied(s: GameSession, card: string) {
  let r = ok(s.takeAction(0, 'meeting-place'))
  if (r.interaction.stateId === 'wait' && r.interaction.request.kind === 'choice') { const c = r.interaction.request.options.find(o => o.value.startsWith('action-improvement-')); if (c) r = ok(s.resolveChoice(0, c.value)) }
  assert(!r.state.players[0]!.minorPlayed.includes(card))
  if (r.interaction.stateId === 'wait' && r.interaction.request.kind === 'choice') assert(!r.interaction.request.options.some(o => o.value === card && !o.disabled))
  assertRejectedUnchanged(s, () => s.resolveChoice(0, card))
}
export function bonus(r: SessionResponse, card: string, owner = 0) { assert(r.scores); return r.scores[owner]!.categories.find(c => c.key === 'cardBonusVp')?.entries.find(e => e.type === 'bonus' && e.cardId === card)?.score ?? 0 }
export function cardMenu(s: GameSession, r: SessionResponse, card: string, actor = 0) {
  if (r.interaction.stateId === 'wait' && r.interaction.request.kind === 'select-trigger') { const c = r.interaction.request.options.find(o => o.sourceCard === card || o.value === card); assert(c); r = ok(s.resolveChoice(actor, c.value)) }
  return r
}
export function accept(s: GameSession, r: SessionResponse, amount = 1, card = FACADES, actor = 0) { r = cardMenu(s, r, card, actor); const c = options(r).filter(o => o.value !== '__skip__' && o.value !== 'skip')[amount - 1]; assert(c && !c.disabled, JSON.stringify(r.interaction)); return ok(s.resolveChoice(actor, c.value)) }
export function decline(s: GameSession, r: SessionResponse, card: string) { r = cardMenu(s, r, card); const c = options(r).find(o => o.value === '__skip__' || o.value === 'skip'); assert(c); return ok(s.resolveChoice(0, c.value)) }
export function facades({ wood = 8, food = 5, round = 8, played = false, reed = 1 } = {}) { return setup(FACADES, { played, round, resources: { wood, food, clay: 2, reed } }) }
export function saw(wood = 1, played = true, configure: (state: GameState) => void = () => {}) { return setup(SAW, { played, resources: { wood, clay: 2, reed: 1 } }, configure) }
export function renovate(s: GameSession, actor = 0, space = 'house-redevelopment', target = 'clay') { let r = ok(s.takeAction(actor, space)); if (r.interaction.stateId === 'wait' && r.interaction.promptKey === 'ui.interactionChooseRenovationTarget') r = ok(s.resolveChoice(actor, target)); return r }
export function housing(state: GameState, sheep: number, owner = 0, mixed = false) {
  const p = state.players[owner]!; p.resources.sheep = sheep
  p.pastures = [{ id: `wool-${owner}`, tiles: [{ row: 0, col: 1 }, { row: 0, col: 2 }], animalType: 'sheep', animalCount: mixed ? Math.min(sheep, 3) : sheep }]
  p.fenceSegments = ['H-0-1', 'H-0-2', 'H-1-1', 'H-1-2', 'V-0-1', 'V-0-3'].map(edge => ({ edge, type: 'fence', source: { kind: 'own', ownerPlayerId: p.id } }))
  p.stableTiles = mixed ? [{ row: 0, col: 3 }] : [{ row: 0, col: 1 }]
  p.houseAnimals = mixed && sheep > 3 ? { '2-0': 'sheep' } : {}
  p.stableAnimals = mixed && sheep > 4 ? { '0-3': { animalType: 'sheep', animalCount: 1 } } : {}
}
export function wool({ sheep = 5, played = false, mixed = false } = {}, configure: (state: GameState) => void = () => {}) { return setup(WOOL, { played }, state => { housing(state, sheep, 0, mixed); configure(state) }) }
