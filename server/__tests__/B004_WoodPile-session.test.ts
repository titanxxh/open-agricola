import { describe, expect, it, afterEach } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'

import '../../shared/cards/B/B004_WoodPile'
import assert from 'node:assert/strict'
import { assertRejectedUnchanged } from './_helpers/negative-rule-audit'
import * as audit18Placement from './_helpers/audit/ae-negative-18-placement'

const CARD_ID = 'B004_WoodPile'

const setup = (placements: string[]) => {
  const session = new GameSession(4, undefined, { playerCount: 2 })
  const state = session.getState().state
  stabilizeRandomHands(state.players)
  state.currentPlayerIndex = 0
  state.round = 6
  state.availableMajorImprovements = []
  const player = state.players[0]!
  player.minorHand = [CARD_ID]
  player.occupationHand = ['__test_placeholder__']
  player.resources.wood = 0
  const family = Math.max(2, placements.length + 1)
  player.workers.forEach((worker, index) => {
    worker.isActive = index < family
    worker.isNewborn = false
  })
  placements.forEach((spaceId, index) => {
    state.actionSpaces.find((space) => space.id === spaceId)!.takenBy = [{
      playerId: player.id,
      workerId: player.workers[index]!.id,
    }]
  })
  session.loadState(state)
  return session
}

const play = (session: GameSession) => session.takeAction(0, 'major-improvement')

describe('B004 Wood Pile parity', () => {
  it('B004 S1: no people on accumulation spaces grants no wood', () => {
    const response = play(setup([]))

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources.wood).toBe(0)
    expect(response.state.players[1]!.minorHand).toContain(CARD_ID)
  })

  it('B004 S2: one occupied accumulation space grants one wood', () => {
    const response = play(setup(['forest']))

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources.wood).toBe(1)
    expect(response.state.players[1]!.minorHand).toContain(CARD_ID)
  })

  it('B004 S3: two occupied accumulation spaces grant two wood', () => {
    const response = play(setup(['forest', 'clay-pit']))

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources.wood).toBe(2)
    expect(response.state.players[1]!.minorHand).toContain(CARD_ID)
  })

  it('B004 S4: a person on a non-accumulation space grants no wood', () => {
    const response = play(setup(['farmland']))

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources.wood).toBe(0)
    expect(response.state.players[1]!.minorHand).toContain(CARD_ID)
  })
})

describe('ae-negative-18-placement', () => {
  const { CARD, sessions, save, ok, setup, turn, prepare, buy } = audit18Placement
  afterEach(()=>sessions.splice(0).forEach(s=>s.dispose()))
  it('B004 N1 zero through three real own accumulation placements determine immediate wood count',()=>{for(const n of[0,1,2,3]){const s=setup(n),before=JSON.parse(JSON.stringify(prepare(s,n))),r=buy(s);assert.equal(r.state.players[0]!.resources.wood-before.state.players[0].resources.wood,n);assert.equal(r.state.players[1]!.resources.wood,before.state.players[1].resources.wood);assert.ok(r.state.players[1]!.minorHand.includes(CARD));save(`B004-N1-${n}`,{before,r})}})
  it('B004 N2 own nonaccumulation and opponent accumulation people do not count',()=>{const s=setup(1);turn(s,0,'grain-seeds');turn(s,1,'forest');const before=JSON.parse(JSON.stringify(s.getState())),r=buy(s);assert.equal(r.state.players[0]!.resources.wood,0);assert.equal(r.state.players[1]!.resources.wood,before.state.players[1].resources.wood);save('B004-N2',{before,r})})
  it('B004 N3 whole purchase undo restores wood and card hands with a single retry reward',()=>{const s=setup(1);prepare(s,1);const before=JSON.parse(JSON.stringify(s.getState())),r=buy(s);assertRejectedUnchanged(s,()=>s.resolveChoice(0,CARD));const undone=ok(s.undoAction());assert.equal(undone.state.players[0]!.resources.wood,before.state.players[0].resources.wood);assert.ok(undone.state.players[0]!.minorHand.includes(CARD));assert.ok(!undone.state.players[1]!.minorHand.includes(CARD));const retry=buy(s);assert.equal(retry.state.players[0]!.resources.wood,before.state.players[0].resources.wood+1);save('B004-N3',{before,r,undone,retry})})
})
