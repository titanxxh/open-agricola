// Helpers of ae-negative-13-minor-session.test.ts from the negative audit snapshot fafd4f51b.
import assert from 'node:assert/strict'
import fs from '../audit-evidence-fs'
import type { GameSession, SessionResponse } from '../../../game/authoritative-session'
import type { GameState } from '../../../../shared/contract/types'
import { createWorkSession } from '../session-fixtures'

export const LIFE = 'B001_UpscaleLifestyle', STABLE = 'C002_Stable', ZIG = 'D001_ZigzagHarrow', POLE = 'E001_PoleBarns'
export const sessions: GameSession[] = []
export const output = process.env.AGRICOLA_NEGATIVE_ARTIFACT_DIR ?? 'output/ae-negative/13-minor-probes'
export function save(id: string, value: unknown) { fs.mkdirSync(output, { recursive: true }); fs.writeFileSync(`${output}/${id}.json`, JSON.stringify(value, null, 2)) }
export function ok(r: SessionResponse) { assert.equal(r.ok, true, r.error); return r }
export function setup(card: string, wood: number, configure: (state: GameState) => void = () => {}) {
  const session = createWorkSession({ seed: 4242, configure(state) {
    state.round = 14
    for (const p of state.players) Object.assign(p.resources, { food: 40, wood: 0, clay: 0, reed: 0, stone: 0, grain: 0, vegetable: 0 })
    state.players[0]!.resources.wood = wood; state.players[0]!.minorHand = [card, 'A030_BakingSheet', 'A016_RammedClay']; configure(state)
  } }); sessions.push(session); return session
}
export function enterMinor(session: GameSession) {
  let r = ok(session.takeAction(0, 'meeting-place'))
  assert.ok(r.interaction.stateId === 'wait' && r.interaction.request.kind === 'choice')
  const action = r.interaction.request.options.find(o => o.value.startsWith('action-improvement-'))
  assert.ok(action, JSON.stringify(r.interaction)); r = ok(session.resolveChoice(0, action.value))
  return r
}
export function buy(session: GameSession, card: string) {
  let r = enterMinor(session)
  if (r.state.players[0]!.minorHand.includes(card)) {
    assert.ok(r.interaction.stateId === 'wait' && r.interaction.request.kind === 'choice', JSON.stringify(r.interaction))
    const option = r.interaction.request.options.find(o => o.value === card); assert.ok(option, JSON.stringify(r.interaction)); r = ok(session.resolveChoice(0, option.value))
  }
  assert(r.state.players[1]!.minorHand.includes(card)); return r
}
export function optional(session: GameSession, r: SessionResponse, accept: boolean) {
  assert.ok(r.interaction.stateId === 'wait' && r.interaction.request.kind === 'choice', JSON.stringify(r.interaction))
  const option = r.interaction.request.options.find(o => accept ? o.value !== '__skip__' : o.value === '__skip__'); assert.ok(option); return ok(session.resolveChoice(0, option.value))
}
export function zigzag(state: GameState) { state.players[0]!.fields = [{ row: 0, col: 2, stacks: [] }, { row: 0, col: 3, stacks: [] }, { row: 1, col: 3, stacks: [] }] }
// Fifteen ordinary own fence segments: a complete outer rectangle partitioned
// into four legal pastures; no virtual or extra components used.
export const poleEdges = ['H-0-1','H-0-2','H-0-3','H-2-1','H-2-2','H-2-3','V-0-1','V-1-1','V-0-4','V-1-4','V-0-2','V-1-2','V-0-3','V-1-3','H-1-1']
export function pole(state: GameState, count = 15, actor = 0) {
  const p = state.players[actor]!
  if (count === 15) p.pastures = [ [{ row: 0, col: 1 }], [{ row: 1, col: 1 }], [{ row: 0, col: 2 }, { row: 1, col: 2 }], [{ row: 0, col: 3 }, { row: 1, col: 3 }] ].map((tiles, i) => ({ id: `pole-${i}`, tiles, animalType: null, animalCount: 0 }))
  p.fenceSegments = poleEdges.slice(0, count).map(edge => ({ edge, type: 'fence', source: { kind: 'own', ownerPlayerId: p.id } }))
}
