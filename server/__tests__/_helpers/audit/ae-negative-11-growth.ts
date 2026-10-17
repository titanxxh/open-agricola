// Helpers of ae-negative-11-growth-session.test.ts from the negative audit snapshot fafd4f51b.
import assert from 'node:assert/strict'
import { mkdirSync } from '../audit-evidence-fs'
import type { FenceSegment, GameState, Resource } from '../../../../shared/contract/types'
import type { GameSession, SessionResponse } from '../../../game/authoritative-session'
import { familySize, newbornCount, setActiveWorkerCount } from '../../../../shared/domain/player'
import { createWorkSession } from '../session-fixtures'
import { assertRejectedUnchanged, confirmNext, passPreparationExchanges } from '../negative-rule-audit'

export const HOME = 'A085_Homekeeper', PARENTS = 'A092_AdoptiveParents', BED = 'A093_BedMaker'
export const ANY = 'A92-adoptive-parents-anytime-grow', WAGE = 'B007_Wage'
export const sessions: GameSession[] = []
export const directory = process.env.AGRICOLA_NEGATIVE_ARTIFACT_DIR ?? `output/ae-negative/11-growth-oa-${Date.now()}-${process.pid}`
mkdirSync(directory, { recursive: true })
export const evidence: unknown[] = []
export function record(name: string, r: SessionResponse) { evidence.push({ name, serializedResponse: JSON.stringify(r) }); return r }
export function ok(r: SessionResponse) { assert.equal(r.ok, true, r.error); return r }
export const rooms = [{ row: 1, col: 0 }, { row: 2, col: 0 }, { row: 1, col: 1 }, { row: 2, col: 1 }, { row: 1, col: 2 }, { row: 2, col: 2 }]
export type Options = { played?: boolean; roomCount?: number; people?: number; house?: 'wood' | 'clay' | 'stone'; round?: number; resources?: Partial<Resource> }
export function setup(card: string, { played = true, roomCount = 2, people = 2, house = 'wood', round = 7, resources = {} }: Options = {}, configure: (state: GameState) => void = () => {}) {
  const s = createWorkSession({ seed: 4242, options: { playerCount: 2 }, configure(state) {
    state.round = round
    for (const p of state.players) {
      p.minorHand = [WAGE]
      p.occupationHand = ['A111_WallBuilder']
      Object.assign(p.resources, { food: 30, wood: 0, clay: 0, reed: 0, stone: 0, grain: 0, vegetable: 0 })
    }
    const p = state.players[0]!
    p.occupationPlayed = played ? [card] : []
    p.occupationHand = played ? ['A111_WallBuilder'] : [card, 'A111_WallBuilder']
    p.rooms = roomCount; p.roomTiles = rooms.slice(0, roomCount).map(t => ({ ...t })); p.houseType = house
    setActiveWorkerCount(p, people); Object.assign(p.resources, resources)
    configure(state)
  } })
  sessions.push(s)
  for (const p of s.state.players) assert.equal(p.workers.length, 5)
  return s
}
export function options(r: SessionResponse) {
  ok(r); assert(r.interaction.stateId === 'wait' && r.interaction.request.kind === 'choice', JSON.stringify(r.interaction))
  return r.interaction.request.options
}
export function choose(s: GameSession, r: SessionResponse, accept = true, actor = 0) {
  const option = options(r).find(o => accept ? o.value !== '__skip__' && o.value !== '__done__' && !('disabled' in o && o.disabled) : o.value === '__skip__')
  assert(option, JSON.stringify(r.interaction))
  return record('choice', ok(s.resolveChoice(actor, option.value)))
}
export function finish(s: GameSession, r: SessionResponse, actor = 0) {
  for (let n = 0; n < 5 && r.interaction.stateId === 'wait' && r.interaction.request.kind === 'choice'; n++) {
    const skip = r.interaction.request.options.find(o => o.value === '__skip__' || o.value === '__done__')
    assert(skip, JSON.stringify(r.interaction)); r = record('finish-optional', ok(s.resolveChoice(actor, skip.value)))
  }
  return r
}
export function ready(s: GameSession, actor: number) {
  let r = s.getState()
  if (r.interaction.stateId === 'wait' && r.interaction.request.kind === 'confirm-next-player') r = record('confirm', confirmNext(s, r))
  assert.equal(r.state.currentPlayerIndex, actor); return r
}
export function turn(s: GameSession, actor: number, space: string) { ready(s, actor); return record(`take:${space}`, ok(s.takeAction(actor, space))) }
export function growth(s: GameSession) { return finish(s, turn(s, 0, 'wish-children')) }
export function values(r: SessionResponse) {
  const p = r.state.players[0]!
  return { rooms: p.rooms, family: familySize(p), newborns: newbornCount(p), wood: p.resources.wood, reed: p.resources.reed, grain: p.resources.grain, food: p.resources.food }
}
export function geometry(state: GameState, field: { row: number; col: number } | null = { row: 0, col: 0 }, pasture: { row: number; col: number } | null = { row: 1, col: 1 }) {
  const p = state.players[0]!
  p.fields = field ? [{ ...field, stacks: [] }] : []
  if (!pasture) return
  const { row, col } = pasture
  p.fenceSegments = [`H-${row}-${col}`, `H-${row + 1}-${col}`, `V-${row}-${col}`, `V-${row}-${col + 1}`].map(edge => ({ edge, type: 'fence' } satisfies FenceSegment))
  p.pastures = [{ id: 'p1', tiles: [{ ...pasture }], animalType: null, animalCount: 0 }]
}
export function denyGrowth(s: GameSession) { record('rejected-growth', assertRejectedUnchanged(s, () => s.takeAction(0, 'wish-children'))); assert.equal(newbornCount(s.state.players[0]!), 0) }
export function build(s: GameSession, tiles = [rooms[2]!], actor = 0, stable = false) {
  let r = turn(s, actor, 'farm-expansion')
  if (r.interaction.stateId === 'wait' && r.interaction.request.kind === 'choice') {
    const c = r.interaction.request.options.find(o => o.labelKey === 'actions.construct.name')
    assert(c, JSON.stringify(r.interaction)); r = record('construct-branch', ok(s.resolveChoice(actor, c.value)))
  }
  assert(r.interaction.stateId === 'wait' && r.interaction.request.kind === 'farm-select', JSON.stringify(r.interaction))
  return record('construct', ok(s.commitSelectionChoice(actor, stable ? { rooms: [], stables: tiles } : { rooms: tiles, stables: [] })))
}
export function bed(s: GameSession, tiles = [rooms[2]!], accept = true) {
  let r = build(s, tiles)
  if (r.interaction.stateId === 'wait' && r.interaction.sourceCard === BED) r = choose(s, r, accept)
  return finish(s, r)
}
export function doubleRooms(state: GameState) {
  geometry(state)
  const p = state.players[0]!
  p.roomTiles = [rooms[0]!, rooms[1]!, rooms[3]!].map(t => ({ ...t }))
  p.fields = [{ row: 0, col: 0 }, { row: 0, col: 1 }, { row: 0, col: 2 }, { row: 1, col: 2 }, { row: 2, col: 2 }].map(t => ({ ...t, stacks: [] }))
}
export function lastOrdinary(s: GameSession) {
  growth(s); turn(s, 1, 'forest'); turn(s, 0, 'reed-bank')
  const last = turn(s, 1, 'clay-pit')
  return record('extra-turn-offer', confirmNext(s, last))
}
export function nextRound(s: GameSession, r: SessionResponse) {
  for (let i = 0; i < 8 && (r.state.round === 7 || r.state.roundPhase === 'preparation'); i++) {
    r = passPreparationExchanges(s, r)
    if (r.interaction.stateId === 'wait' && r.interaction.request.kind === 'confirm-next-player') r = record('round-confirm', confirmNext(s, r))
    else break
  }
  assert.equal(r.state.round, 8); assert.equal(r.state.roundPhase, 'work'); return r
}
export function lesson(s: GameSession, card: string) {
  const r = turn(s, 0, 'lessons'); const found = options(r).find(o => o.value === card); assert(found, JSON.stringify(r.interaction))
  return record('play-occupation', ok(s.resolveChoice(0, found.value)))
}
