import { describe, expect, it, afterEach } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'

import '../../shared/cards/A/A043_FarmyardManure'
import '../../shared/cards/A/A042_ForestLakeHut'
import '../../shared/cards/A/A046_ClawKnife'
import '../../shared/cards/A/A089_StablePlanner'
import '../../shared/cards/A/A006_StorageBarn'
import assert from 'node:assert/strict'
import { assertRejectedUnchanged, assertUndoRestored, undoRuleSnapshot } from './_helpers/negative-rule-audit'
import { getAvailableStableSupplyCount } from '../../shared/domain/supply-tokens'
import { markAllWorkersUsed } from '../../shared/domain/player'
import * as audit07Triggers from './_helpers/audit/ae-negative-07-triggers'

const CARD_ID = 'A043_FarmyardManure'

describe('A043_FarmyardManure session', () => {
  const setup = () => {
    const session = new GameSession(42)
    stabilizeRandomHands(session.state.players)
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    state.currentPlayerIndex = 0
    state.round = 3

    const player = state.players[0]!
    player.minorPlayed.push(CARD_ID)
    // Give wood so we can afford stables (1 wood each).
    player.resources.wood = 5

    session.loadState(state)
    return session
  }

  it('queues 1 FOOD on next 3 round spaces after building a stable', () => {
    const session = setup()

    let resp = session.takeAction(0, 'farm-expansion')
    expect(resp.ok).toBe(true)
    // With wood only (no reed), farm-expansion auto-selects stables → farmSelect.
    expect(resp.interaction.stateId).toBe('wait')
    if (resp.interaction.stateId !== 'wait') return
    expect(resp.interaction.request.farm.farmType).toBe('stable')
    if (resp.interaction.request.farm.farmType !== 'stable') return

    const stable = resp.interaction.request.farm.selectableTiles[0]!
    resp = session.commitSelectionChoice(0, { stables: [stable] })
    expect(resp.ok).toBe(true)

    // Expect 3 future-meeple entries owned by our player for the next 3 rounds.
    const playerId = resp.state.players[0]!.id
    const entries = resp.state.futureMeeples.filter(
      (e) => e.cardId === CARD_ID && e.playerId === playerId,
    )
    expect(entries).toHaveLength(3)
    const rounds = entries.map((e) => e.round).sort((a, b) => a - b)
    expect(rounds).toEqual([4, 5, 6])
    entries.forEach((entry) => {
      expect(entry.resources.food).toBe(1)
    })
  })

  it('fires only once per turn even if multiple stables are built', () => {
    const session = setup()

    let resp = session.takeAction(0, 'farm-expansion')
    expect(resp.ok).toBe(true)
    if (resp.interaction.stateId !== 'wait') return
    if (resp.interaction.request.farm.farmType !== 'stable') return

    const [t1, t2] = resp.interaction.request.farm.selectableTiles
    resp = session.commitSelectionChoice(0, { stables: [t1!, t2!] })
    expect(resp.ok).toBe(true)

    const entries = resp.state.futureMeeples.filter((e) => e.cardId === CARD_ID)
    // Still only 3 entries (not 6) because the card fires once per Turn.
    expect(entries).toHaveLength(3)
  })

  it('does not trigger when card is not played', () => {
    const session = new GameSession(42)
    stabilizeRandomHands(session.state.players)
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    state.currentPlayerIndex = 0

    const player = state.players[0]!
    player.resources.wood = 5

    session.loadState(state)

    let resp = session.takeAction(0, 'farm-expansion')
    expect(resp.ok).toBe(true)
    if (resp.interaction.stateId !== 'wait') return
    if (resp.interaction.request.farm.farmType !== 'stable') return

    const stable = resp.interaction.request.farm.selectableTiles[0]!
    resp = session.commitSelectionChoice(0, { stables: [stable] })
    expect(resp.ok).toBe(true)
    const entries = resp.state.futureMeeples.filter((e) => e.cardId === CARD_ID)
    expect(entries).toHaveLength(0)
  })
})

describe('ae-negative-07-triggers', () => {
  const { MANURE, sessions, setup, pet, ok, choices, turn, enter, offered, buy, future, build, room, nextRound } = audit07Triggers
  afterEach(() => sessions.splice(0).forEach(s => s.dispose()))
  it('A043 N1 an owned accommodated animal permits the actual free purchase without a stable bonus', () => {
    const s=setup(MANURE,{played:false,configure:pet});const r=buy(s,enter(s),MANURE);assert.deepEqual(future(r,MANURE),[]);assert.equal(r.state.players[0]!.resources.sheep,1)
  })
  it('A043 N2 no owned animal or only an opponent animal rejects purchase before a legal retry', () => {
    for(const other of[false,true]){const s=setup(MANURE,{played:false,configure(state){if(other)pet(state,1)}});const r=enter(s);assert.equal(offered(r,MANURE),false);assertRejectedUnchanged(s,()=>s.resolveChoice(0,MANURE));const done=buy(s,r,'A054_Credit');assert.deepEqual(future(done,MANURE),[])}
  })
  it('A043 N3 one paid stable schedules one food on each of the next three rounds', () => {
    const s=setup(MANURE,{resources:{wood:2}});const r=build(s,1);assert.deepEqual(future(r,MANURE),[6,7,8]);assert.equal(r.state.players[0]!.resources.food,20)
  })
  it('A043 N4 two stables in one turn still schedule only three food', () => {
    const s=setup(MANURE,{resources:{wood:4}});const r=build(s,2);assert.deepEqual(future(r,MANURE),[6,7,8]);assert.equal(s.withCtx(() => getAvailableStableSupplyCount(r.state,r.state.players[0]!)),2)
  })
  it('A043 N5 four stables consume the finite four piece supply and still schedule only three food', () => {
    const s=setup(MANURE,{resources:{wood:8}});assert.equal(s.withCtx(() => getAvailableStableSupplyCount(s.getState().state,s.getState().state.players[0]!)),4);const r=build(s,4);assert.deepEqual(future(r,MANURE),[6,7,8]);assert.equal(s.withCtx(() => getAvailableStableSupplyCount(r.state,r.state.players[0]!)),0)
  })
  it('A043 N6 one wood cannot pay for a stable or create a food schedule', () => {
    const s=setup(MANURE,{resources:{wood:1}});assertRejectedUnchanged(s,()=>s.takeAction(0,'farm-expansion'));const r=turn(s,0,'grain-seeds');assert.equal(r.state.players[0]!.stableTiles.length,0);assert.equal(r.state.players[0]!.resources.wood,1);assert.deepEqual(future(r,MANURE),[])
  })
  it('A043 N7 exhausted stable supply offers rooms alone and permits a legal room retry', () => {
    const s=setup(MANURE,{resources:{wood:10,reed:2},configure(state){state.players[0]!.stableTiles=[{row:0,col:1},{row:0,col:2},{row:0,col:3},{row:0,col:4}]}});assert.equal(s.withCtx(() => getAvailableStableSupplyCount(s.getState().state,s.getState().state.players[0]!)),0);room(s);assertRejectedUnchanged(s,()=>s.commitSelectionChoice(0,{rooms:[],stables:[{row:1,col:1}]}));const r=ok(s.commitSelectionChoice(0,{rooms:[{row:0,col:0}],stables:[]}));assert.equal(r.state.players[0]!.stableTiles.length,4);assert.equal(r.state.players[0]!.rooms,3);assert.equal(r.state.players[0]!.resources.wood,5);assert.deepEqual(future(r,MANURE),[])
  })
  it('A043 N8 a completed room construction with no stable schedules no food', () => {
    const s=setup(MANURE,{resources:{wood:5,reed:2}});room(s);const r=ok(s.commitSelectionChoice(0,{rooms:[{row:0,col:0}],stables:[]}));assert.equal(r.state.players[0]!.rooms,3);assert.equal(r.state.players[0]!.stableTiles.length,0);assert.deepEqual(future(r,MANURE),[])
  })
  it('A043 N9 an opponent stable build cannot schedule owner food', () => {
    const s=setup(MANURE,{configure(state){state.players[1]!.resources.wood=2}});turn(s,0,'grain-seeds');const r=build(s,1,1);assert.deepEqual(future(r,MANURE),[]);assert.equal(r.state.players[0]!.stableTiles.length,0)
  })
  it('A043 N10 a stable built while the card remains in hand creates no schedule', () => {
    const s=setup(MANURE,{played:false,resources:{wood:2}});const r=build(s,1);assert.deepEqual(future(r,MANURE),[]);assert.equal(r.state.players[0]!.minorHand.includes(MANURE),true)
  })
  it('A043 N11 round thirteen and fourteen schedule only reachable future rounds', () => {
    for(const round of[13,14]){const s=setup(MANURE,{round,resources:{wood:2}});const r=build(s,1);assert.deepEqual(future(r,MANURE),round===13?[14]:[])}
  })
  it('A043 N12 a natural next round delivers exactly one scheduled food once to the owner', () => {
    const s=setup(MANURE,{resources:{wood:2}});build(s,1);const r=nextRound(s);assert.equal(r.state.players[0]!.resources.food,21);assert.equal(r.state.players[1]!.resources.food,20);assert.deepEqual(future(r,MANURE),[7,8]);assertRejectedUnchanged(s,()=>s.resolveChoice(0,'__forged_collect_again__'))
  })
  it('A043 N13 a controlled off turn free Stable Planner stable does not trigger food', () => {
    const s=setup(MANURE,{configure(state){state.players.forEach(p=>markAllWorkersUsed(state,p));state.players[0]!.occupationPlayed=['A089_StablePlanner'];state.futureMeeples=[{id:'controlled-stable-planner-reservation',cardId:'A089_StablePlanner',playerId:state.players[0]!.id,round:6,actionId:null,resources:{stable:1}}]}});let r=ok(s.performRoundEnd());const option=choices(r).find(o=>o.value!=='__skip__');assert.ok(option);r=ok(s.resolveChoice(0,option.value));assert.ok(r.interaction.stateId==='wait'&&r.interaction.request.kind==='farm-select'&&r.interaction.request.farm.farmType==='stable');const tile=r.interaction.request.farm.selectableTiles[0];assert.ok(tile);r=ok(s.commitSelectionChoice(0,{stables:[tile]}));assert.equal(r.state.players[0]!.stableTiles.length,1);assert.equal(r.state.players[0]!.resources.wood,0);assert.deepEqual(future(r,MANURE),[])
  })
  it('A043 N14 undo after stable payment restores the public rule snapshot only where exposed', () => {
    const s=setup(MANURE,{resources:{wood:2}});const before=undoRuleSnapshot(s.getState());const r=build(s,1);assert.deepEqual(future(r,MANURE),[6,7,8]);assertUndoRestored(before,s.undoAction());const retry=build(s,1);assert.deepEqual(future(retry,MANURE),[6,7,8])
  })
  it('A043 N15 an empty Farm Expansion with no stables available cannot consume a worker turn', () => {
    const s=setup(MANURE,{resources:{wood:10,reed:2},configure(state){state.players[0]!.stableTiles=[{row:0,col:1},{row:0,col:2},{row:0,col:3},{row:0,col:4}]}})
    room(s)
    assertRejectedUnchanged(s,()=>s.commitSelectionChoice(0,{rooms:[],stables:[]}))
    const r=ok(s.commitSelectionChoice(0,{rooms:[{row:0,col:0}],stables:[]}))
    assert.equal(r.state.players[0]!.rooms,3);assert.equal(r.state.players[0]!.stableTiles.length,4);assert.deepEqual(future(r,MANURE),[])
  })
})
