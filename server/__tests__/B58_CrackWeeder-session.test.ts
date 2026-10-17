import { describe, expect, it, afterEach } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'
import { getCardEffect, runCardEffectHook } from '../../shared/cards/card-effects'

import { markAllWorkersUsed, setActiveWorkerCount } from '../../shared/domain/player'
import '../../shared/cards/B/B058_CrackWeeder'
import type { ActionChoiceOption } from '../../shared/contract/types'
import type { ActionFlow } from '../../shared/contract/types'
import assert from 'node:assert/strict'
import type { GameState } from '../../shared/contract/types'
import { assertRejectedUnchanged } from './_helpers/negative-rule-audit'
import * as audit21Harvest from './_helpers/audit/ae-negative-21-harvest'

const CARD_ID = 'B058_CrackWeeder'

describe('B058_CrackWeeder session', () => {
  it('onBuy returns a gain-1-food flow', () => {
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
    expect((flow as Extract<ActionFlow, { type: 'leaf' }>).params?.food).toBe(1)
  })

  it('onAfterReap gives 1 food per vegetable field harvested', () => {
    const session = new GameSession(42)
    stabilizeRandomHands(session.state.players)
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    const player = state.players[0]!
    player.minorPlayed.push(CARD_ID)
    player.resources.food = 5

    // Simulate 2 vegetable fields harvested
    state.harvestReapSummary = {
      [player.id]: { resources: { vegetable: 2 }, grainFields: 0, vegetableFields: 2 },
    }

    session.loadState(state)

    const flow = session.withCtx(() => runCardEffectHook(state, player, CARD_ID, 'onAfterReap'))
    expect(flow).toBeDefined()
    expect(flow!.type).toBe('leaf')
    expect((flow as Extract<ActionFlow, { type: 'leaf' }>).params?.food).toBe(2)
  })

  it('onAfterReap does not trigger when no vegetable fields harvested', () => {
    const session = new GameSession(42)
    stabilizeRandomHands(session.state.players)
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    const player = state.players[0]!
    player.minorPlayed.push(CARD_ID)
    player.resources.food = 5

    // Only grain fields harvested
    state.harvestReapSummary = {
      [player.id]: { resources: { grain: 3 }, grainFields: 3, vegetableFields: 0 },
    }

    session.loadState(state)

    const flow = session.withCtx(() => runCardEffectHook(state, player, CARD_ID, 'onAfterReap'))
    expect(flow).toBeNull()
  })


  it('integration: harvest with vegetable fields gives food bonus', () => {
    const session = new GameSession(42)
    stabilizeRandomHands(session.state.players)
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    state.round = 4 // harvest round

    state.players.forEach((p) => {
      markAllWorkersUsed(state, p)
      setActiveWorkerCount(p, 1)
      p.resources.food = 10
    })

    const player = state.players[0]!
    player.minorPlayed.push(CARD_ID)
    player.resources.food = 10
    // Vegetable field with remaining=1 — will be harvested
    player.fields = [
      { row: 0, col: 0, stacks: [{ kind: 'vegetable', remaining: 1 }] },
    ]

    session.loadState(state)

    let resp = session.performRoundEnd()

    // Drive through all pending states
    let safety = 30
    while (safety-- > 0 && resp.interaction.stateId === 'wait') {
      if (resp.interaction.stateId === 'wait' && resp.interaction.request.kind === 'feed') {
        resp = session.resolveChoice(resp.interaction.playerIndex, 'confirm', { selections: [] })
      } else if (resp.interaction.stateId === 'wait' && resp.interaction.stateId === 'wait' ? resp.interaction.promptKey : undefined === 'ui.interactionAnimalReorg') {
        resp = session.resolveChoice(resp.interaction.playerIndex, 'confirm', resp.interaction.request.zones)
      } else if (resp.interaction.stateId === 'wait') {
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

    // After harvest, player should have gained 1 vegetable from reaping + 1 food from CrackWeeder
    // Started with 10 food, gained 1 from card, paid 2 for feeding (1 family member)
    const p = resp.state.players[0]!
    expect(p.resources.food).toBe(10 + 1 - 2)
  })
})

describe('ae-negative-21-harvest', () => {
  const { WEED, sessions, save, ok, setup, menu, buy, end, fields } = audit21Harvest
  afterEach(()=>sessions.splice(0).forEach(s=>s.dispose()))
  it('B058 N1 actual one wood purchase immediately gives one food and missing cost rejects before undo replay',()=>{const s=setup(WEED,state=>state.players[0]!.resources.wood=1),{pending,r}=buy(s,WEED);assert.equal(r.state.players[0]!.resources.wood,0);assert.equal(r.state.players[0]!.resources.food,101);const undone=ok(s.undoAction());assert.equal(undone.state.players[0]!.resources.wood,1);assert.equal(undone.state.players[0]!.resources.food,100);assert.ok(undone.state.players[0]!.minorHand.includes(WEED));const retry=buy(s,WEED).r;assert.equal(retry.state.players[0]!.resources.food,101);const poor=setup(WEED),denied=menu(poor);assertRejectedUnchanged(poor,()=>poor.resolveChoice(0,WEED));const legal=ok(poor.resolveChoice(0,'B004_WoodPile'));assert.equal(legal.state.players[0]!.resources.food,100);save('B058-N1',{pending,r,undone,retry,denied,legal})})
  it('B058 N2 natural harvest vegetable collection rewards zero through three food and excludes grain or empty field',()=>{for(const n of[0,1,2,3]){const configure=(state:GameState)=>fields(state,[...Array.from({length:n},()=>'vegetable' as const),'grain',null]),on=end(setup(WEED,configure,true)),off=end(setup(WEED,configure,false));assert.equal(on.r.state.players[0]!.resources.food-off.r.state.players[0]!.resources.food,n);assert.equal(on.r.state.players[0]!.resources.vegetable,n);assert.equal(on.r.state.players[0]!.resources.grain,2);assert.equal(on.r.state.players[1]!.resources.food,off.r.state.players[1]!.resources.food);assert.equal(on.r.state.round,5);save(`B058-N2-${n}`,{on,off})}})
  it('B058 N3 nonharvest hand and opponent vegetables never grant Crack Weeder income',()=>{const configure=(state:GameState)=>fields(state,['vegetable','vegetable']),on=end(setup(WEED,configure,true,3)),off=end(setup(WEED,configure,false,3));assert.equal(on.r.state.players[0]!.resources.food,off.r.state.players[0]!.resources.food);const other=(state:GameState)=>fields(state,['vegetable','vegetable'],1),a=end(setup(WEED,other,true)),b=end(setup(WEED,other,false));assert.equal(a.r.state.players[0]!.resources.food,b.r.state.players[0]!.resources.food);assert.equal(a.r.state.players[1]!.resources.vegetable,2);save('B058-N3',{on,off,a,b})})
})
