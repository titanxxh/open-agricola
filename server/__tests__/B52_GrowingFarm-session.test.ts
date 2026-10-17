import { describe, expect, it, afterEach } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { B052_GrowingFarm } from '../../shared/cards/B/B052_GrowingFarm'
import { meetsCardPrerequisites } from '../../shared/cards/helpers/prerequisites'
import assert from 'node:assert/strict'
import { assertRejectedUnchanged } from './_helpers/negative-rule-audit'
import * as audit20Farm from './_helpers/audit/ae-negative-20-farm'

describe('B052_GrowingFarm prerequisite', () => {
  it('blocks when covered pasture zones < round - 1', () => {
    const session = new GameSession(42)
    const state = session.getState().state
    state.round = 5
    const player = state.players[0]!
    player.pastures = [{
      id: 'p1',
      tiles: [{ row: 0, col: 0 }, { row: 1, col: 0 }],
      animalType: null,
      animalCount: 0,
      size: 2,
      stables: 0,
    }]
    expect(session.withCtx(() => meetsCardPrerequisites(player, B052_GrowingFarm, state.round, state))).toBe(false)
  })

  it('allows when covered pasture zones >= round - 1', () => {
    const session = new GameSession(42)
    const state = session.getState().state
    state.round = 5
    const player = state.players[0]!
    player.pastures = [{
      id: 'p1',
      tiles: [
        { row: 0, col: 0 },
        { row: 1, col: 0 },
        { row: 2, col: 0 },
        { row: 0, col: 1 },
      ],
      animalType: null,
      animalCount: 0,
      size: 4,
      stables: 0,
    }]
    expect(session.withCtx(() => meetsCardPrerequisites(player, B052_GrowingFarm, state.round, state))).toBe(true)
  })
})

describe('ae-negative-20-farm', () => {
  const { CARD, sessions, save, ok, pasture, setup, menu, buy } = audit20Farm
  afterEach(()=>sessions.splice(0).forEach(s=>s.dispose()))
  it('B052 N1 actual three player purchase counts completed rounds and pasture area not pasture count',()=>{for(const[round,n]of[[1,0],[5,4],[5,5]]){const s=setup(round,n),{pending,r}=buy(s);assert.equal(r.state.players[0]!.resources.clay,0);assert.equal(r.state.players[0]!.resources.reed,0);assert.equal(r.state.players[0]!.resources.food,20+round!);assert.equal(r.state.players[0]!.pastures.length,n?1:0);assert.equal(r.scores![0]!.categories.find(c=>c.key==='cards')!.entries.find(e=>'cardId'in e&&e.cardId===CARD)!.score,2);assert.equal(r.state.players[1]!.resources.food,20);save(`B052-N1-${round}-${n}`,{pending,r})}})
  it('B052 N2 one fewer pasture space or only opponent pasture cannot satisfy completed rounds',()=>{for(const mode of['three','opponent','stable-field']){const s=setup(5,mode==='three'?3:0,state=>{if(mode==='opponent')pasture(state,4,1);if(mode==='stable-field'){const p=state.players[0]!;p.stableTiles=[{row:0,col:0}];p.fields=[{row:0,col:1,stacks:[]},{row:0,col:2,stacks:[]},{row:0,col:3,stacks:[]}]}}),pending=menu(s);assertRejectedUnchanged(s,()=>s.resolveChoice(0,CARD));const legal=ok(s.resolveChoice(0,'B004_WoodPile'));assert.equal(legal.state.players[0]!.resources.food,20);assert.equal(legal.state.players[0]!.resources.clay,2);assert.equal(legal.state.players[0]!.resources.reed,1);save(`B052-N2-${mode}`,{pending,legal})}})
  it('B052 N3 clay or reed shortfall and wrong actor cannot pay or grant food before legal alternative',()=>{for(const mode of['clay','reed']as const){const s=setup(5,4,state=>state.players[0]!.resources[mode]=mode==='clay'?1:0),pending=menu(s);assertRejectedUnchanged(s,()=>s.resolveChoice(0,CARD));assertRejectedUnchanged(s,()=>s.resolveChoice(1,'B004_WoodPile'));const legal=ok(s.resolveChoice(0,'B004_WoodPile'));assert.equal(legal.state.players[0]!.resources.food,20);save(`B052-N3-${mode}`,{pending,legal})}})
  it('B052 N4 real purchase undo restores clay reed food pasture score and exactly one retry',()=>{const s=setup(),r=buy(s).r,undone=ok(s.undoAction());assert.equal(undone.state.players[0]!.resources.clay,2);assert.equal(undone.state.players[0]!.resources.reed,1);assert.equal(undone.state.players[0]!.resources.food,20);assert.equal(undone.state.players[0]!.pastures[0]!.tiles.length,4);assert.ok(undone.state.players[0]!.minorHand.includes(CARD));const retry=buy(s).r;assert.equal(retry.state.players[0]!.resources.food,25);assert.equal(retry.state.players[0]!.minorPlayed.filter(id=>id===CARD).length,1);save('B052-N4',{r,undone,retry})})
})
