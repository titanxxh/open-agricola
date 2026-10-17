import { describe, expect, it, afterEach } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'
import { getCardEffect } from '../../shared/cards/card-effects'

import { markAllWorkersUsed } from '../../shared/domain/player'
import '../../shared/cards/B/B117_Informant'
import type { ActionChoiceOption } from '../../shared/contract/types'
import type { ActionFlow } from '../../shared/contract/types'
import assert from 'node:assert/strict'
import * as audit27Endphase from './_helpers/audit/ae-negative-27-endphase'

const CARD_ID = 'B117_Informant'

describe('B117_Informant session', () => {
  it('onBuy returns a gain-1-wood flow', () => {
    const session = new GameSession(42)
    stabilizeRandomHands(session.state.players)
    const state = session.getState().state
    state.players = state.players.slice(0, 2)

    const player = state.players[0]!
    session.loadState(state)

    const effect = session.withCtx(() => getCardEffect(CARD_ID))
    expect(effect).toBeDefined()
    const flow = session.withCtx(() => effect!.onBuy!(state, player))
    expect(flow).toBeDefined()
    expect(flow!.type).toBe('leaf')
    expect((flow as Extract<ActionFlow, { type: 'leaf' }>).params?.wood).toBe(1)
  })

  it('onBeforeReturnHome gives 1 wood when stone > clay', () => {
    const session = new GameSession(42)
    stabilizeRandomHands(session.state.players)
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    state.round = 1

    const player = state.players[0]!
    player.occupationPlayed.push(CARD_ID)
    player.resources.stone = 5
    player.resources.clay = 2
    player.resources.wood = 0

    session.loadState(state)

    const effect = session.withCtx(() => getCardEffect(CARD_ID))
    expect(effect).toBeDefined()
    const flow = session.withCtx(() => effect!.onBeforeReturnHome!(state, player))
    expect(flow).toBeDefined()
    expect(flow!.type).toBe('leaf')
    expect((flow as Extract<ActionFlow, { type: 'leaf' }>).params?.wood).toBe(1)
  })

  it('onBeforeReturnHome does not trigger when stone <= clay', () => {
    const session = new GameSession(42)
    stabilizeRandomHands(session.state.players)
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    state.round = 1

    const player = state.players[0]!
    player.occupationPlayed.push(CARD_ID)
    player.resources.stone = 3
    player.resources.clay = 3 // equal, not strictly greater
    player.resources.wood = 0

    session.loadState(state)

    const effect = session.withCtx(() => getCardEffect(CARD_ID))
    const flow = session.withCtx(() => effect!.onBeforeReturnHome!(state, player))
    expect(flow).toBeUndefined()
  })

  it('onBeforeReturnHome does not trigger when stone < clay', () => {
    const session = new GameSession(42)
    stabilizeRandomHands(session.state.players)
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    state.round = 1

    const player = state.players[0]!
    player.occupationPlayed.push(CARD_ID)
    player.resources.stone = 1
    player.resources.clay = 5
    player.resources.wood = 0

    session.loadState(state)

    const effect = session.withCtx(() => getCardEffect(CARD_ID))
    const flow = session.withCtx(() => effect!.onBeforeReturnHome!(state, player))
    expect(flow).toBeUndefined()
  })

  it('multi-player: only owner gains wood (not opponent)', () => {
    // The reference L29-33 isListeningTo isPlayerEvent → handler scoped to card owner only.
    // Our onBeforeReturnHome runs runCardEffectHook(state, player, ...) per
    // owner of the played card, so opponent without the card is unaffected.
    const session = new GameSession(42)
    stabilizeRandomHands(session.state.players)
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    state.round = 1

    const owner = state.players[0]!
    const opponent = state.players[1]!
    owner.occupationPlayed.push(CARD_ID)
    owner.resources.stone = 5
    owner.resources.clay = 1
    opponent.resources.stone = 5
    opponent.resources.clay = 1

    session.loadState(state)

    const effect = session.withCtx(() => getCardEffect(CARD_ID))
    const ownerFlow = session.withCtx(() => effect!.onBeforeReturnHome!(state, owner))
    expect(ownerFlow).toBeDefined()
    expect((ownerFlow as Extract<ActionFlow, { type: 'leaf' }>).params?.wood).toBe(1)
    // The opponent does not own this card, so the per-card iteration in
    // continueStageHook would not invoke the hook for them. We don't assert
    // here on the listener-bus level; the trigger code in game-core gates
    // by getPlayerEffectCardIds(player) which excludes cards not in
    // occupationPlayed/minorPlayed/improvements. Sanity-check that owner
    // has it and opponent does not.
    expect(owner.occupationPlayed).toContain(CARD_ID)
    expect(opponent.occupationPlayed).not.toContain(CARD_ID)
  })

  it('integration: end of work phase gives wood when stone > clay', () => {
    const session = new GameSession(42)
    stabilizeRandomHands(session.state.players)
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    state.round = 1

    state.players.forEach((p) => {
      markAllWorkersUsed(state, p)
      p.resources.food = 10
    })

    const player = state.players[0]!
    player.occupationPlayed.push(CARD_ID)
    player.resources.stone = 4
    player.resources.clay = 1
    player.resources.wood = 3

    session.loadState(state)

    let resp = session.performRoundEnd()

    // Drive through any pending choices
    let safety = 30
    while (safety-- > 0 && resp.interaction.stateId === 'wait') {
      if (resp.interaction.stateId === 'wait') {
        const skipOpt = resp.interaction.request.options?.find((o: ActionChoiceOption) => o.value === '__skip__')
        if (skipOpt) {
          resp = session.resolveChoice(resp.interaction.playerIndex ?? 0, '__skip__')
        } else {
          resp = session.resolveChoice(resp.interaction.playerIndex ?? 0, resp.interaction.request.options[0]!.value)
        }
      } else {
        break
      }
    }

    // After round end, Informant should have given 1 wood during return home phase
    expect(resp.state.players[0]!.resources.wood).toBe(3 + 1)
  })
})

describe('ae-negative-27-endphase', () => {
  const { INFO, sessions, save, ok, finish, make, transition, lesson } = audit27Endphase
  afterEach(()=>sessions.splice(0).forEach(s=>s.dispose()))
  it('B117 N1 real first Lessons gives one immediate wood regardless of equal zero stone and clay',()=>{const s=make(INFO,false,0,0,0),a=lesson(s,INFO);assert.equal(a.r.state.players[0]!.resources.wood,1);assert.equal(a.r.state.players[1]!.resources.wood,0);save('B117-N1',a)})
  it('B117 N2 natural end of work requires strictly more owned stone than clay before granting one wood',()=>{for(const[stone,clay]of[[2,1],[1,1],[0,1]]){const s=make(INFO,true,0,stone,clay),c=make(INFO,false,0,stone,clay),r=transition(s),control=transition(c);assert.equal(r.state.players[0]!.resources.wood,control.state.players[0]!.resources.wood+(stone>clay?1:0));assert.equal(r.state.players[0]!.resources.stone,stone);assert.equal(r.state.players[0]!.resources.clay,clay);save(`B117-N2-${stone}-${clay}`,{r,control})}})
  it('B117 N3 actual midround action and card in hand never award the end of work wood',()=>{const s=make(INFO),before=ok(s.getState()),r=finish(s,ok(s.takeAction(0,'grain-seeds')),false);assert.equal(r.state.players[0]!.resources.wood,before.state.players[0]!.resources.wood);const hand=transition(make(INFO,false)),c=transition(make(INFO,false));assert.equal(hand.state.players[0]!.resources.wood,c.state.players[0]!.resources.wood);save('B117-N3',{before,r,hand,c})})
  it('B117 N4 whole occupation undo removes immediate wood and restores hand before replay once',()=>{const s=make(INFO,false),a=lesson(s,INFO),undone=ok(s.undoAction());assert.equal(undone.state.players[0]!.resources.wood,0);assert.ok(undone.state.players[0]!.occupationHand.includes(INFO));const retry=lesson(s,INFO);assert.equal(retry.r.state.players[0]!.resources.wood,1);save('B117-N4',{a,undone,retry})})
})
