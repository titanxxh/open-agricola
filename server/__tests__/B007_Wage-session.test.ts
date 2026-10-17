import { describe, expect, it, afterEach } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'

import '../../shared/cards/B/B007_Wage'
import assert from 'node:assert/strict'
import * as audit18Immediate from './_helpers/audit/ae-negative-18-immediate'

const CARD_ID = 'B007_Wage'

const setup = (improvements: string[]) => {
  const session = new GameSession(7, undefined, { playerCount: 2 })
  const state = session.getState().state
  stabilizeRandomHands(state.players)
  state.currentPlayerIndex = 0
  state.round = 6
  state.availableMajorImprovements = []
  const player = state.players[0]!
  player.minorHand = [CARD_ID]
  player.occupationHand = ['__test_placeholder__']
  player.improvements = improvements
  player.resources.food = 0
  session.loadState(state)
  return session
}

describe('B007 Wage parity', () => {
  it('B007 S1: Wage grants two food with no bottom-row major improvement', () => {
    const response = setup([]).takeAction(0, 'major-improvement')

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources.food).toBe(2)
    expect(response.state.players[1]!.minorHand).toContain(CARD_ID)
  })

  it('B007 S2: two bottom-row major improvements add two food', () => {
    const response = setup(['Major_ClayOven', 'Major_Basket']).takeAction(0, 'major-improvement')

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources.food).toBe(4)
    expect(response.state.players[1]!.minorHand).toContain(CARD_ID)
  })

  it('B007 S3: a top-row major improvement adds no food', () => {
    const response = setup(['Major_Well']).takeAction(0, 'major-improvement')

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources.food).toBe(2)
    expect(response.state.players[1]!.minorHand).toContain(CARD_ID)
  })
})

describe('ae-negative-18-immediate', () => {
  const { WAGE, sessions, save, ok, setup, buy, BOTTOM } = audit18Immediate
  afterEach(()=>sessions.splice(0).forEach(s=>s.dispose()))
  it('B007 N1 each bottom row major adds one food to the two food immediate reward',()=>{for(const count of[0,1,2,3,4,5]){const s=setup(WAGE,state=>{state.players[0]!.improvements=BOTTOM.slice(0,count);state.availableMajorImprovements=state.availableMajorImprovements.filter(id=>!BOTTOM.slice(0,count).includes(id))});const r=buy(s,WAGE);assert.equal(r.state.players[0]!.resources.food,22+count);assert.equal(r.state.players[1]!.resources.food,20);save(`B007-N1-${count}`,r)}})
  it('B007 N2 own top row minors and opponent bottom row cards do not add food',()=>{const s=setup(WAGE,state=>{state.players[0]!.improvements=['Major_Fireplace1','Major_Well'];state.players[0]!.minorPlayed=['A030_BakingSheet'];state.players[0]!.minorHand=[WAGE,'A004_Baseboards'];state.players[1]!.improvements=BOTTOM;state.availableMajorImprovements=state.availableMajorImprovements.filter(id=>!['Major_Fireplace1','Major_Well',...BOTTOM].includes(id))});const r=buy(s,WAGE);assert.equal(r.state.players[0]!.resources.food,22);assert.equal(r.state.players[1]!.resources.food,20);save('B007-N2',r)})
  it('B007 N3 whole passing purchase undo restores food and one legal retry adds once',()=>{const s=setup(WAGE);const r=buy(s,WAGE),undone=ok(s.undoAction());assert.equal(undone.state.players[0]!.resources.food,20);assert.ok(undone.state.players[0]!.minorHand.includes(WAGE));const retry=buy(s,WAGE);assert.equal(retry.state.players[0]!.resources.food,22);save('B007-N3',{r,undone,retry})})
})
