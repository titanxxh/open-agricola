import { describe, expect, it, afterEach } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'

import '../../shared/cards/B/B006_ExcursiontotheQuarry'
import assert from 'node:assert/strict'
import { assertRejectedUnchanged } from './_helpers/negative-rule-audit'
import * as audit18Immediate from './_helpers/audit/ae-negative-18-immediate'

const CARD_ID = 'B006_ExcursiontotheQuarry'

const setup = ({ occupations = 1, food = 2, family = 2 } = {}) => {
  const session = new GameSession(6, undefined, { playerCount: 2 })
  const state = session.getState().state
  stabilizeRandomHands(state.players)
  state.currentPlayerIndex = 0
  state.round = 6
  state.availableMajorImprovements = []
  const player = state.players[0]!
  player.minorHand = [CARD_ID]
  player.occupationHand = ['__test_placeholder__']
  player.occupationPlayed = Array.from({ length: occupations }, (_, index) => `__test_occupation_${index}__`)
  player.resources = { ...player.resources, food, stone: 0 }
  player.workers.forEach((worker, index) => {
    worker.isActive = index < family
    worker.isNewborn = false
  })
  session.loadState(state)
  return session
}

describe('B006 Excursion to the Quarry parity', () => {
  it('B006 S1: two people grant two stone after paying two food', () => {
    const response = setup().takeAction(0, 'major-improvement')

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources).toMatchObject({ food: 0, stone: 2 })
    expect(response.state.players[1]!.minorHand).toContain(CARD_ID)
  })

  it('B006 S2: three people grant three stone', () => {
    const response = setup({ family: 3 }).takeAction(0, 'major-improvement')

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources).toMatchObject({ food: 0, stone: 3 })
    expect(response.state.players[1]!.minorHand).toContain(CARD_ID)
  })

  it('B006 S3: no occupation keeps Excursion to the Quarry unavailable', () => {
    const response = setup({ occupations: 0 }).takeAction(0, 'major-improvement')

    expect(response.state.players[0]!.minorHand).toContain(CARD_ID)
    expect(response.state.players[0]!.resources).toMatchObject({ food: 2, stone: 0 })
  })

  it('B006 S4: less than two food keeps Excursion to the Quarry unavailable', () => {
    const response = setup({ food: 1 }).takeAction(0, 'major-improvement')

    expect(response.state.players[0]!.minorHand).toContain(CARD_ID)
    expect(response.state.players[0]!.resources).toMatchObject({ food: 1, stone: 0 })
  })
})

describe('ae-negative-18-immediate', () => {
  const { QUARRY, sessions, save, ok, setup, menu, buy } = audit18Immediate
  afterEach(()=>sessions.splice(0).forEach(s=>s.dispose()))
  it('B006 N1 real paid card counts two through five finite people including home and placed',()=>{for(const family of[2,3,4,5]){const s=setup(QUARRY,state=>{const p=state.players[0]!;p.resources.food=2;p.occupationPlayed=['A110_Roughcaster'];p.rooms=family;p.roomTiles=[{row:0,col:0},{row:1,col:0},{row:1,col:1},{row:2,col:0},{row:2,col:1}].slice(0,family);p.workers.forEach((w,i)=>{w.isActive=i<family;w.isNewborn=false})});const r=buy(s,QUARRY);assert.equal(r.state.players[0]!.resources.food,0);assert.equal(r.state.players[0]!.resources.stone,family);assert.equal(r.state.players[1]!.resources.stone,0);save(`B006-N1-${family}`,r)}})
  it('B006 N2 missing occupation or less than two food rejects then legal alternative remains',()=>{for(const[played,food]of[[true,0],[true,1],[false,2]]as const){const s=setup(QUARRY,state=>{state.players[0]!.resources.food=food;state.players[0]!.occupationPlayed=played?['A110_Roughcaster']:[]});const pending=menu(s);assertRejectedUnchanged(s,()=>s.resolveChoice(0,QUARRY));const legal=ok(s.resolveChoice(0,'A030_BakingSheet'));assert.equal(legal.state.players[0]!.resources.food,food);assert.equal(legal.state.players[0]!.resources.stone,0);assert.ok(legal.state.players[0]!.minorHand.includes(QUARRY));save(`B006-N2-${played}-${food}`,{pending,legal})}})
  it('B006 N3 invalid actor and stale purchase cannot pay twice or grant opponent stone',()=>{const s=setup(QUARRY,state=>{state.players[0]!.resources.food=2;state.players[0]!.occupationPlayed=['A110_Roughcaster']});const pending=menu(s);assertRejectedUnchanged(s,()=>s.resolveChoice(1,QUARRY));const r=ok(s.resolveChoice(0,QUARRY));assertRejectedUnchanged(s,()=>s.resolveChoice(0,QUARRY));assert.equal(r.state.players[0]!.resources.stone,2);assert.equal(r.state.players[0]!.resources.food,0);save('B006-N3',{pending,r})})
})
