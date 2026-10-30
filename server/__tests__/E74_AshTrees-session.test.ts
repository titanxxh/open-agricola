import { descriptionEffects } from './_helpers/choice-description'
import { describe, expect, it, afterEach } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'
import { getRegisteredCardListeners, executeCardListener, type CardListenerContext } from '../../shared/cards/card-listeners'

import '../../shared/cards/E/E074_AshTrees'
import '../../shared/cards/B/B030_WoodPalisades'
import assert from 'node:assert/strict'
import { assertRejectedUnchanged, assertRuleOutcome } from './_helpers/negative-rule-audit'
import * as audit41Resources from './_helpers/audit/ae-negative-41-resources'

const edgesForTile = (row: number, col: number) => [
  `H-${row}-${col}`,
  `H-${row + 1}-${col}`,
  `V-${row}-${col}`,
  `V-${row}-${col + 1}`,
]

describe('E074_AshTrees session flow', () => {
  it('lets fencing reach fence selection using stored free fences', () => {
    const session = new GameSession(42, undefined, { playerCount: 2 })
    stabilizeRandomHands(session.state.players)
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    state.currentPlayerIndex = 0

    const player = state.players[0]!
    player.resources.wood = 0
    player.fields = [
      { row: 0, col: 0, stacks: [{ kind: 'grain', remaining: 1 }] },
      { row: 0, col: 1, stacks: [{ kind: 'grain', remaining: 1 }] },
    ]
    player.minorPlayed.push('E074_AshTrees')
    player.cardStates = {
      ...player.cardStates,
      E074_AshTrees: { counters: { fences: 4 } },
    }

    session.loadState(state)
    const listener = session.withCtx(() => getRegisteredCardListeners()).find((entry) => entry.id === 'E74-ash-trees-isdoable-fence')
    expect(listener).toBeDefined()
    const currentState = session.getState().state
    const direct = session.withCtx(() => executeCardListener(listener!, {
      actionHooks: session.actionHooks,
      state: currentState,
      player: currentState.players[0]!,
      space: currentState.actionSpaces.find((space) => space.id === 'fencing')!,
      actionId: 'fence',
      phase: 'isDoable',
      doable: false,
    } as unknown as CardListenerContext))
    expect(direct?.doable).toBe(true)

    let resp = session.takeAction(0, 'fencing')
    expect(resp.interaction.stateId).toBe('wait')
    expect(resp.interaction.stateId === 'wait' ? resp.interaction.promptKey : undefined)
      .toBe('ui.interactionAshTrees')
    if (resp.interaction.stateId !== 'wait') {
      throw new Error('expected Ash Trees choice')
    }
    const useAll = resp.interaction.request.options?.find(
      (option) =>
        descriptionEffects(option.descriptionPreview).some(effect => effect.kind === 'fenceReserve' && effect.amount === 4),
    )
    expect(useAll).toBeDefined()

    resp = session.resolveChoice(0, useAll!.value)
    expect(resp.interaction.stateId).toBe('wait')
    expect(resp.interaction.stateId === 'wait' ? resp.interaction.request.farm.farmType : undefined)
      .toBe('fence')

    resp = session.commitSelectionChoice(0, {
      edges: edgesForTile(1, 1),
    })

    expect(resp.ok).toBe(true)
    expect(resp.state.players[0]!.resources.wood).toBe(0)
    expect(resp.state.players[0]!.cardStates?.E074_AshTrees?.counters?.fences).toBe(0)
  })

  it('freeFences only discount fences, palisades still cost full wood (with B30)', () => {
    const session = new GameSession(42, undefined, { playerCount: 2 })
    stabilizeRandomHands(session.state.players)
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    state.currentPlayerIndex = 0

    const player = state.players[0]!
    // 3 fence edges * 1 wood = 3, minus 3 freeFences = 0
    // 2 palisade edges * 2 wood = 4
    // total = 4 wood
    player.resources.wood = 4
    player.minorPlayed.push('E074_AshTrees', 'B030_WoodPalisades')
    player.cardStates = {
      ...player.cardStates,
      E074_AshTrees: { counters: { fences: 5 } },
    }

    session.loadState(state)

    let resp = session.takeAction(0, 'fencing')
    expect(resp.ok).toBe(true)
    expect(resp.interaction.stateId).toBe('wait')

    // Select "use 3" to reserve freeFences=3
    if (resp.interaction.stateId !== 'wait') throw new Error('expected choice')
    const useThree = resp.interaction.request.options?.find(
      (o) => descriptionEffects(o.descriptionPreview).some(effect => effect.kind === 'fenceReserve' && effect.amount === 3),
    )
    expect(useThree).toBeDefined()
    resp = session.resolveChoice(0, useThree!.value)

    // Enclose tile (0,0) with 2 fences + 2 palisades.
    // Palisades must be on border: H-0-0 (top), V-0-0 (left).
    // Fences on internal edges: H-1-0, V-0-1.
    // Cost: 2 fences × 1 = 2, minus 2 freeFences = 0; 2 palisades × 2 = 4. Total = 4 wood.
    resp = session.commitSelectionChoice(0, {
      edges: ['H-1-0', 'V-0-1'],
      palisadeEdges: ['H-0-0', 'V-0-0'],
    })

    expect(resp.ok).toBe(true)
    const result = resp.state.players[0]!
    expect(result.resources.wood).toBe(0)
    // counter decrements by 2 (newFenceEdges.length), not 5 — palisades do NOT decrement E74 counter
    expect(result.cardStates?.E074_AshTrees?.counters?.fences).toBe(3)
  })
})

describe('ae-negative-41-resources', () => {
  const { sessions, ok, save, opts, setup, finish, select, play, next, planted, ashEdges, ash } = audit41Resources
  afterEach(() => sessions.splice(0).forEach(s => s.dispose()))
  it('E074 N1 real two planted field purchase stores finite fences and four free fences leave one stored fence',()=>{
   const s=setup('E074_AshTrees',st=>planted(st),false,5),bought=play(s,'E074_AshTrees');assert.equal(bought.state.players[0]!.cardStates.E074_AshTrees?.counters?.fences,5);next(s,bought);next(s,finish(s,ok(s.takeAction(1,'reed-bank'))));const p=ash(s,4),r=finish(s,ok(s.commitSelectionChoice(0,{edges:ashEdges})));assert.equal(r.state.players[0]!.resources.wood,0);assert.equal(r.state.players[0]!.cardStates.E074_AshTrees?.counters?.fences,1);assert.equal(r.state.players[0]!.fenceSegments.length,4);assert.equal(r.state.players[0]!.pastures.length,1);save('E074-N1',{bought,p,r})
  })
  it('E074 N2 one planted field must reject purchase and a held card cannot provide free fencing',()=>{
   const s=setup('E074_AshTrees',st=>{planted(st,1);st.players[0]!.resources.wood=2;st.players[0]!.minorHand.push('A057_MilkingParlor','D074_RoyalWood')},false,5),p=select(s,ok(s.takeAction(0,'meeting-place')),o=>o.value.startsWith('action-improvement-'));assert.ok(!opts(p).some(o=>o.value==='E074_AshTrees'&&!o.disabled));const bad=assertRejectedUnchanged(s,()=>s.resolveChoice(0,'E074_AshTrees')),u=ok(s.undoAction());assert.equal(u.state.players[0]!.cardStates.E074_AshTrees?.counters?.fences??0,0);assert.ok(u.state.players[0]!.minorHand.includes('E074_AshTrees'));const control=play(s,'A057_MilkingParlor');assert.ok(control.state.players[0]!.minorPlayed.includes('A057_MilkingParlor'));assert.equal(control.state.players[0]!.resources.wood,0);const t=setup('E074_AshTrees',()=>{},false),error=assertRejectedUnchanged(t,()=>t.takeAction(0,'fencing'));save('E074-N2',{p,bad,u,control,held:t.getState(),error});assertRuleOutcome({ok:bad.ok,played:bad.state.players[0]!.minorPlayed.includes('E074_AshTrees'),stored:bad.state.players[0]!.cardStates.E074_AshTrees?.counters?.fences??0},{ok:false,played:false,stored:0})
  })
  it('E074 N3 declining stored fences pays usual wood and whole action undo restores board and reserve',()=>{
   const s=setup('E074_AshTrees',st=>{planted(st);st.players[0]!.resources.wood=4},false,5),bought=play(s,'E074_AshTrees');next(s,bought);next(s,finish(s,ok(s.takeAction(1,'reed-bank'))));const p=ok(s.takeAction(0,'fencing')),q=select(s,p,o=>o.value==='__skip__'),r=finish(s,ok(s.commitSelectionChoice(0,{edges:ashEdges}))),u=ok(s.undoAction());assert.equal(r.state.players[0]!.resources.wood,0);assert.equal(r.state.players[0]!.cardStates.E074_AshTrees?.counters?.fences,5);assert.equal(u.state.players[0]!.resources.wood,4);assert.equal(u.state.players[0]!.cardStates.E074_AshTrees?.counters?.fences,5);assert.equal(u.state.players[0]!.fenceSegments.length,0);save('E074-N3',{p,q,r,u})
  })
  it('E074 N4 six free fences cannot be requested from five stored fences and a legal five fence plus wood control builds six',()=>{
   const s=setup('E074_AshTrees',st=>{planted(st);st.players[0]!.resources.wood=1},false,5),bought=play(s,'E074_AshTrees');next(s,bought);next(s,finish(s,ok(s.takeAction(1,'reed-bank'))));const p=ok(s.takeAction(0,'fencing'));assert.ok(!opts(p).some(o=>o.effectPreview?.kind==='fenceReserve'&&o.effectPreview.amount===6));const bad=assertRejectedUnchanged(s,()=>s.resolveChoice(0,'xor:5')),q=select(s,p,o=>o.effectPreview?.kind==='fenceReserve'&&o.effectPreview.amount===5),r=finish(s,ok(s.commitSelectionChoice(0,{edges:['H-0-1','H-0-2','H-1-1','H-1-2','V-0-1','V-0-3']})));assert.equal(r.state.players[0]!.resources.wood,0);assert.equal(r.state.players[0]!.cardStates.E074_AshTrees?.counters?.fences,0);assert.equal(r.state.players[0]!.fenceSegments.length,6);save('E074-N4',{p,bad,q,r})
  })
})
