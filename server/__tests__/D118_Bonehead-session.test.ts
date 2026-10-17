import { describe, expect, it, afterEach } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'
import { getCardStack } from '../../shared/cards/helpers/card-state'
import { resolveTriggerIfPresent } from './_helpers/trigger-select'

import '../../shared/cards/D/D118_Bonehead'
import type { ActionChoiceOption } from '../../shared/contract/types'
import assert from 'node:assert/strict'
import { assertRuleOutcome } from './_helpers/negative-rule-audit'
import * as audit49Cards from './_helpers/audit/ae-negative-49-cards'

describe('D118_Bonehead session', () => {
  /**
   * Setup with D118_Bonehead already played.
   * After onBuy: 6 wood placed, 1 popped immediately → 5 left on stack.
   */
  const setup = () => {
    const session = new GameSession(42)
    stabilizeRandomHands(session.state.players)
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    state.currentPlayerIndex = 0
    state.round = 1

    const player = state.players[0]!
    // Manually add occupation as played (not in catalog)
    player.occupationPlayed.push('D118_Bonehead')
    if (!player.cardStates) player.cardStates = {}
    // 5 wood remaining (1 already taken via onBuy flow)
    player.cardStates['D118_Bonehead'] = {
      stack: ['wood', 'wood', 'wood', 'wood', 'wood'],
    }

    // Give another occupation in hand so we can test playing it
    player.occupationHand = ['A102_Grocer', 'A085_Homekeeper']
    player.resources.food = 5

    session.loadState(state)
    return session
  }

  it('stack has 5 wood after setup (1 already taken at play time)', () => {
    const session = setup()
    const state = session.getState().state
    const stack = getCardStack(state.players[0]!, 'D118_Bonehead')
    expect(stack.length).toBe(5)
    expect(stack.every(item => item === 'wood')).toBe(true)
  })

  it('playing an occupation via lessons gives 1 wood from card', () => {
    const session = setup()
    const state = session.getState().state
    const initialWood = state.players[0]!.resources.wood
    session.loadState(state)

    // Use lessons to play an occupation (A102_Grocer)
    let resp = session.takeAction(0, 'lessons')
    expect(resp.ok).toBe(true)

    // Should be in choice to select which occupation to play
    expect(resp.interaction.stateId).toBe('wait')
    if (resp.interaction.stateId !== 'wait') throw new Error('expected occupation choice')

    // Select A102_Grocer
    const grocerOption = resp.interaction.request.options?.find((o: ActionChoiceOption) => o.value === 'A102_Grocer')
    expect(grocerOption).toBeDefined()
    resp = session.resolveChoice(0, 'A102_Grocer')
    expect(resp.ok).toBe(true)
    resp = resolveTriggerIfPresent(session, resp, 'D118_Bonehead')

    // After playing occupation, D118 should have given 1 wood
    const p = resp.state.players[0]!
    const stack = getCardStack(p, 'D118_Bonehead')
    expect(stack.length).toBe(4)
    // Wood gained: initialWood + 1 (from bonehead pop)
    expect(p.resources.wood).toBe(initialWood + 1)
  })

  it('no wood given when stack is empty', () => {
    const session = setup()
    const state = session.getState().state
    const initialWood = state.players[0]!.resources.wood
    state.players[0]!.cardStates!['D118_Bonehead']!.stack = []
    session.loadState(state)

    let resp = session.takeAction(0, 'lessons')
    expect(resp.ok).toBe(true)

    const grocerOption = resp.interaction.request.options?.find((o: ActionChoiceOption) => o.value === 'A102_Grocer')
    expect(grocerOption).toBeDefined()
    resp = session.resolveChoice(0, 'A102_Grocer')
    expect(resp.ok).toBe(true)

    const p = resp.state.players[0]!
    // No wood gain (stack was empty)
    expect(p.resources.wood).toBe(initialWood)
  })
})

describe('ae-negative-49-cards', () => {
  const { BONE, sessions, save, ok, make, ready, lesson, ownerReady, cardStock, minor, next } = audit49Cards
  afterEach(()=>sessions.splice(0).forEach(s=>s.dispose()))
  it('D118 N1 actual Bonehead purchase stores six wood and takes one including itself then a later occupation and hand minor each take exactly one',()=>{const s=make(BONE,false),bought=lesson(s,BONE);assert.equal(bought.state.players[0]!.resources.wood,1);assert.equal(cardStock(bought,BONE),5);const u=ok(s.undoAction());assert.equal(u.state.players[0]!.resources.wood,0);assert.equal(cardStock(u,BONE),0);const replay=lesson(s,BONE);ownerReady(s);const small=minor(s);assert.equal(small.state.players[0]!.resources.wood,2);assert.equal(cardStock(small,BONE),4);const nine=next(s,9),occupation=lesson(s,'A110_Roughcaster');assert.equal(occupation.state.players[0]!.resources.wood,3);assert.equal(cardStock(occupation,BONE),3);save('D118-N1',{bought,u,replay,small,nine,occupation})})
  it('D118 N2 a major bought from the common supply is not a card played from hand and cannot take Bonehead wood',()=>{const s=make(BONE,false,state=>{state.availableMajorImprovements=['Major_Well'];state.players[0]!.resources.stone=3}),bought=lesson(s,BONE);ownerReady(s);const r=minor(s,'Major_Well'),actual={wood:r.state.players[0]!.resources.wood,stock:cardStock(r,BONE),majorPlayed:r.state.players[0]!.improvements.includes('Major_Well')};save('D118-N2',{bought,r,actual});assertRuleOutcome(actual,{wood:0,stock:5,majorPlayed:true})})
  it('D118 N3 six real cards from hand exhaust the six wood and a seventh card cannot manufacture more',()=>{const others=['A110_Roughcaster','C100_Butler','D100_LordoftheManor','E100_MuseumCaretaker','E099_UncaringParents','E117_PipeSmoker'],s=make(BONE,false,state=>{state.players[0]!.occupationHand=[BONE,...others];state.players[0]!.minorHand=['__test_placeholder__'];state.players[0]!.resources.food=100}),bought=lesson(s,BONE),rows=[bought];for(const[round,card,wood,stock]of[[9,others[0],2,4],[10,others[1],3,3],[11,others[2],4,2],[12,others[3],5,1],[13,others[4],6,0],[14,others[5],6,0]] as const){next(s,round);const r=lesson(s,card!);assert.equal(r.state.players[0]!.resources.wood,wood);assert.equal(cardStock(r,BONE),stock);rows.push(r)}save('D118-N3',{rows})})
  it('D118 N4 card only in hand ordinary work and an actual opponent hand play never transfer Bonehead wood',()=>{const s=make(BONE,false),hand=lesson(s,'A110_Roughcaster');assert.equal(hand.state.players[0]!.resources.wood,0);const t=make(BONE,false,state=>state.players[1]!.occupationHand=['A110_Roughcaster']),bought=lesson(t,BONE);next(t,9);ok(t.takeAction(0,'grain-seeds'));ready(t);let opponent=ok(t.takeAction(1,'lessons'));if(!opponent.state.players[1]!.occupationPlayed.includes('A110_Roughcaster'))opponent=ok(t.resolveChoice(1,'A110_Roughcaster'));assert.equal(opponent.state.players[0]!.resources.wood,1);assert.equal(cardStock(opponent,BONE),5);ready(t);const mid=ok(t.takeAction(0,'day-laborer'));assert.equal(mid.state.players[0]!.resources.wood,1);assert.equal(cardStock(mid,BONE),5);save('D118-N4',{hand,bought,opponent,mid})})
})
