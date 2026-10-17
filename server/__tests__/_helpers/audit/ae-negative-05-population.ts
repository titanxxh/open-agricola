// Helpers of ae-negative-05-population-session.test.ts from the negative audit snapshot fafd4f51b.
import assert from 'node:assert/strict'
import type { GameState, Resource } from '../../../../shared/contract/types'
import type { GameSession, SessionResponse } from '../../../game/authoritative-session'
import { setActiveWorkerCount } from '../../../../shared/domain/player'
import { createWorkSession } from '../session-fixtures'
import { assertRejectedUnchanged, confirmNext } from '../negative-rule-audit'
import { takeNormalWorkerTurn } from '../supply-worker-turn'

export const HOME = 'A021_FamilyFriendHome', CORNER = 'A026_SleepingCorner', TELEGRAM = 'A022_Telegram'
export const sessions: GameSession[] = []
export function ok(r: SessionResponse) { assert.equal(r.ok, true, r.error); return r }
export const roomTiles = [{ row: 0, col: 0 }, { row: 1, col: 0 }, { row: 2, col: 0 }, { row: 1, col: 1 }, { row: 2, col: 1 }, { row: 0, col: 1 }]
export function setRooms(state: GameState, count: number, owner = 0) {
  state.players[owner]!.rooms = count
  state.players[owner]!.roomTiles = roomTiles.slice(0, count).map(t => ({ ...t }))
}
export function setup(card: string, { played = true, rooms = 3, people = 2, grainFields = 2, occupations = 1, resources = {} }:
  { played?: boolean; rooms?: number; people?: number; grainFields?: number; occupations?: number; resources?: Partial<Resource> } = {},
  configure: (state: GameState) => void = () => {}) {
  const s = createWorkSession({ seed: 4242, configure(state) {
    state.round = 14
    for (const p of state.players) Object.assign(p.resources, { food: 20, wood: 0, clay: 0, reed: 0, stone: 0, grain: 0, vegetable: 0 })
    const p = state.players[0]!
    setRooms(state, rooms)
    setActiveWorkerCount(p, people)
    p.minorHand = played ? ['__test_placeholder__'] : [card, '__test_placeholder__']
    p.minorPlayed = played ? [card] : []
    p.occupationPlayed = occupations ? ['D115_FodderPlanter'] : []
    Object.assign(p.resources, resources)
    if (card === CORNER) p.fields = Array.from({ length: grainFields }, (_, i) => ({ row: 0, col: i + 2, stacks: [{ kind: 'grain', remaining: 1 }] }))
    configure(state)
  } })
  sessions.push(s); return s
}
export function options(r: SessionResponse) {
  ok(r); assert(r.interaction.stateId === 'wait' && r.interaction.request.kind === 'choice', JSON.stringify(r.interaction))
  return r.interaction.request.options
}
export function minorMenu(s: GameSession, card: string) {
  let r = ok(s.takeAction(0, 'meeting-place'))
  if (r.state.players[0]!.minorPlayed.includes(card)) return r
  if (r.interaction.stateId === 'wait' && r.interaction.request.kind === 'choice') {
    const branch = r.interaction.request.options.find(o => o.value.startsWith('action-improvement-'))
    if (branch) r = ok(s.resolveChoice(0, branch.value))
  }
  return r
}
export function denied(s: GameSession, card: string) {
  const r = minorMenu(s, card)
  assert(!r.state.players[0]!.minorPlayed.includes(card))
  if (r.interaction.stateId === 'wait' && r.interaction.request.kind === 'choice') assert(!r.interaction.request.options.some(o => o.value === card && !o.disabled))
  assertRejectedUnchanged(s, () => s.resolveChoice(0, card))
}
export function buy(s: GameSession, card: string) {
  const r = minorMenu(s, card)
  if (r.state.players[0]!.minorPlayed.includes(card)) return r
  assert(options(r).some(o => o.value === card && !o.disabled))
  return ok(s.resolveChoice(0, card))
}
export function construct(s: GameSession, actor = 0) {
  let r = ok(s.takeAction(actor, 'farm-expansion'))
  if (r.interaction.stateId === 'wait' && r.interaction.request.kind === 'choice') {
    const branch = r.interaction.request.options.find(o => o.labelKey === 'actions.construct.name')
    assert(branch); r = ok(s.resolveChoice(actor, branch.value))
  }
  assert(r.interaction.stateId === 'wait' && r.interaction.request.kind === 'farm-select', JSON.stringify(r.interaction))
  return r
}
export function fenceLayout(state: GameState, reserve: 0 | 1) {
  const p = state.players[0]!
  const edges = new Set(['H-0-1', 'H-0-2', 'H-1-1', 'H-1-2', 'V-0-1', 'V-0-3', 'H-0-3', 'H-0-4', 'H-1-3', 'H-1-4', 'V-0-5', 'H-2-4', 'V-1-4', 'V-1-5'])
  const first = reserve === 1
    ? [{ id: 'left', tiles: [{ row: 0, col: 1 }, { row: 0, col: 2 }] }]
    : [{ id: 'left1', tiles: [{ row: 0, col: 1 }] }, { id: 'left2', tiles: [{ row: 0, col: 2 }] }]
  if (reserve === 0) edges.add('V-0-2')
  p.pastures = [...first, { id: 'right', tiles: [{ row: 0, col: 3 }, { row: 0, col: 4 }] }, { id: 'bottom', tiles: [{ row: 1, col: 4 }] }].map(pasture => ({ ...pasture, animalType: null, animalCount: 0 }))
  p.fenceSegments = [...edges].map(edge => ({ edge, type: 'fence', source: { kind: 'own', ownerPlayerId: p.id } }))
  assert.equal(p.fenceSegments.length, 15 - reserve)
}
export function telegram({ round = 1, reserve = 1, food = 20, played = false, people = 2 }:
  { round?: number; reserve?: 0 | 1; food?: number; played?: boolean; people?: number } = {}) {
  return setup(TELEGRAM, { played, rooms: people === 5 ? 5 : 2, people, resources: { food, wood: 1 } }, state => {
    state.round = round; fenceLayout(state, reserve)
    const forest = state.actionSpaces.find(space => space.id === 'forest'); assert(forest); forest.resources.wood = 3
    if (played) state.players[0]!.cardStates[TELEGRAM] = { extraData: { triggerRound: 2 } }
  })
}
export function triggerRound(r: SessionResponse) { return r.state.players[0]!.cardStates[TELEGRAM]?.extraData?.triggerRound }
export function normal(s: GameSession, space: string) { return confirmNext(s, ok(takeNormalWorkerTurn(s, space))) }
export function naturalDue() {
  const s = telegram(); confirmNext(s, buy(s, TELEGRAM))
  normal(s, 'grain-seeds'); normal(s, 'day-laborer'); const r = normal(s, 'clay-pit')
  assert.equal(r.state.round, 2); assert.equal(triggerRound(r), 2); return s
}
export function withoutSnapshotEpoch(r: SessionResponse): SessionResponse {
  return { ...r, state: { ...r.state, players: r.state.players.map(p => {
    const snapshot = p.cardStates.__actionSnapshot__
    if (!snapshot) return p
    const { token: _token, lastToken: _lastToken, ...counts } = snapshot.extraData ?? {}
    return { ...p, cardStates: { ...p.cardStates, __actionSnapshot__: { ...snapshot, extraData: counts } } }
  }) } }
}
