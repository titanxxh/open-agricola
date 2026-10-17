// Helpers of ae-negative-03-multi-step-session.test.ts from the negative audit snapshot fafd4f51b.
import assert from 'node:assert/strict'
import type { GameState, Resource } from '../../../../shared/contract/types'
import type { GameSession, SessionResponse } from '../../../game/authoritative-session'
import { createWorkSession } from '../session-fixtures'
import { markAllWorkersUsed } from '../../../../shared/domain/player'
import { createPlayerActionSpaces } from '../../../../shared/cards/player-action-space'

export const sessions: GameSession[] = []
export const SMUGGLER = 'E142_Smuggler', OVERHAUL = 'C001_Overhaul', HARDWORKER = 'D127_HardworkingMan'
export const one = ['H-0-1', 'H-1-1', 'V-0-1', 'V-0-2']
export const two = [...one, 'H-0-2', 'H-1-2', 'V-0-3']
export function setup(card: string, configure: (state: GameState) => void = () => {}) {
  const session = createWorkSession({ seed: 4242, options: { playerCount: card === OVERHAUL ? 2 : 3 }, configure(state) {
    state.round = 4
    for (const p of state.players) Object.assign(p.resources, { wood: 0, clay: 0, reed: 0, stone: 0, grain: 0, vegetable: 0, food: 20 })
    const owner = state.players[0]!
    if (card === OVERHAUL) {
      owner.minorHand = [card]
      owner.occupationPlayed = ['A116_WoodCutter', 'A103_Portmonger']
      owner.resources.wood = 1
    } else owner.occupationPlayed = [card]
    configure(state)
    if (card === HARDWORKER) state.actionSpaces.push(...createPlayerActionSpaces(state))
  } })
  sessions.push(session)
  return session
}
export function ok(r: SessionResponse) { assert.equal(r.ok, true, r.error); return r }
export function wait(r: SessionResponse) { ok(r); assert(r.interaction.stateId === 'wait'); return r.interaction }
export function options(r: SessionResponse) { const request = wait(r).request; assert(request.kind === 'choice'); return request.options }
export function branch(s: GameSession, r: SessionResponse, action: string) {
  const choice = options(r).find(o => o.labelKey === `actions.${action}.name`)
  assert(choice, JSON.stringify(r.interaction))
  return ok(s.resolveChoice(0, choice.value))
}
export function play(s: GameSession, card: string) {
  let r = ok(s.takeAction(0, 'meeting-place'))
  if (!r.state.players[0]!.minorHand.includes(card)) return r
  const improvement = options(r).find(o => o.value.startsWith('action-improvement-'))
  if (improvement) r = ok(s.resolveChoice(0, improvement.value))
  if (r.state.players[0]!.minorHand.includes(card)) r = ok(s.resolveChoice(0, card))
  return r
}
export function harvest(wood: number, grain: number) {
  const s = setup(SMUGGLER, state => {
    state.players[0]!.resources.wood = wood
    state.players[0]!.resources.grain = grain
    for (const p of state.players) markAllWorkersUsed(state, p)
  })
  return { s, r: ok(s.performRoundEnd()) }
}
export function trade(r: SessionResponse, paid: Partial<Resource>, gained: Partial<Resource>) {
  const choice = options(r).find(o => o.sourceCard === SMUGGLER
    && o.effectPreview?.kind === 'resourceExchange'
    && JSON.stringify(o.effectPreview.resourcesPaid) === JSON.stringify(paid)
    && JSON.stringify(o.effectPreview.resourcesGained) === JSON.stringify(gained))
  assert(choice, JSON.stringify(r.interaction))
  return choice.value
}
export function stocks(r: SessionResponse) {
  const p = r.state.players[0]!
  return { wood: p.resources.wood, grain: p.resources.grain, stone: p.resources.stone,
    exchanges: r.state.events.filter(e => e.type === 'resource.exchanged' && e.exchangeSource === SMUGGLER).length }
}
export function fenceSetup(edges = one, animals = false) {
  return setup(OVERHAUL, state => {
    const p = state.players[0]!
    p.fenceSegments = edges.map(edge => ({ edge, type: 'fence', source: { kind: 'own', ownerPlayerId: p.id } }))
    p.pastures = [{ id: 'one', tiles: [{ row: 0, col: 1 }], animalType: animals ? 'sheep' : null, animalCount: animals ? 2 : 0 }]
    if (edges.length === 7) p.pastures.push({ id: 'two', tiles: [{ row: 0, col: 2 }], animalType: null, animalCount: 0 })
    if (edges.length === 13) for (const col of [2, 3, 4]) p.pastures.push({ id: `pasture-${col}`, tiles: [{ row: 0, col }], animalType: null, animalCount: 0 })
    p.resources.sheep = animals ? 2 : 0
  })
}
export function hardworking(configure: (state: GameState) => void = () => {}) {
  return setup(HARDWORKER, state => {
    for (const p of state.players.slice(1)) {
      p.rooms = 3
      p.roomTiles.push({ row: 1, col: 1 })
    }
    Object.assign(state.players[0]!.resources, { wood: 5, reed: 2, clay: 2, food: 2 })
    state.players[0]!.minorHand = ['A002_ShiftingCultivation']
    configure(state)
  })
}
