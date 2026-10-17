import { describe, expect, it, afterEach } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { getCardEffect } from '../../shared/cards/card-effects'
import type { ActionFlow } from '../../shared/contract/types'
import assert from 'node:assert/strict'
import { assertRejectedUnchanged } from './_helpers/negative-rule-audit'
import * as audit25Trough from './_helpers/audit/ae-negative-25-trough'
const CARD_ID = 'C009_AutomaticWaterTrough'

describe('C009_AutomaticWaterTrough session', () => {
  it('onBuy returns undefined when player has no zone that can hold any animal', () => {
    // The reference `getValidAnimals` returns empty list when no zone can accommodate
    // sheep / boar / cattle. In that case `onBuy` returns void, so the player
    // does not enter a degenerate XOR with no real options.
    const session = new GameSession(42)
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    const player = state.players[0]!
    player.minorPlayed.push(CARD_ID)
    // No pastures, no stables, but the default house zone has capacity 1 and
    // is empty — so it CAN accommodate any 1 animal. To force no valid
    // animals, mark the house zone as already full of grain (impossible per
    // game rules but we use it to simulate a saturated state).
    player.houseAnimals = Object.fromEntries(player.roomTiles.slice(0, 1).map(tile => [`${tile.row}-${tile.col}`, 'sheep' as never]));
    player.resources.sheep = 1
    // Also put a sheep already in any default stable / pasture so no zone
    // has spare capacity. Player has no pastures by default so house +
    // stables-only is enough.
    player.stableAnimals = {}
    session.loadState(state)

    const effect = session.withCtx(() => getCardEffect(CARD_ID))
    expect(effect).toBeDefined()
    const flow = session.withCtx(() => effect!.onBuy!(state, player))
    expect(flow).toBeUndefined()
  })

  it('onBuy XOR includes only animals that can be accommodated', () => {
    const session = new GameSession(42)
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    const player = state.players[0]!
    player.minorPlayed.push(CARD_ID)
    player.resources.food = 5
    // House holds an empty zone (capacity 1) — can take any 1 animal
    player.houseAnimals = {};
    session.loadState(state)

    const effect = session.withCtx(() => getCardEffect(CARD_ID))
    const flow = session.withCtx(() => effect!.onBuy!(state, player)) as ActionFlow
    expect(flow).toBeDefined()
    expect(flow!.type).toBe('xor')
    const xor = flow as Extract<ActionFlow, { type: 'xor' }>
    // All 3 animal types should be available since house zone is empty
    expect(xor.children.length).toBe(3)
    expect(xor.optional).toBe(true)
  })

  it('onBuy filters out animals when already-occupied house pins type', () => {
    const session = new GameSession(42)
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    const player = state.players[0]!
    player.minorPlayed.push(CARD_ID)
    player.resources.food = 5
    // House holds a sheep — this is the only zone, so only sheep is valid
    // (zone occupied by sheep, capacity 1, count 1 → no spare). No other
    // animal can be placed; even sheep can't fit another. So result should
    // be undefined.
    player.houseAnimals = Object.fromEntries(player.roomTiles.slice(0, 1).map(tile => [`${tile.row}-${tile.col}`, 'sheep' as never]));
    player.resources.sheep = 1
    session.loadState(state)

    const effect = session.withCtx(() => getCardEffect(CARD_ID))
    const flow = session.withCtx(() => effect!.onBuy!(state, player))
    expect(flow).toBeUndefined()
  })

  it('onBuy uses final animal totals when animals can be reorganized', () => {
    const session = new GameSession(42)
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    const player = state.players[0]!
    player.minorPlayed.push(CARD_ID)
    player.resources.food = 5
    player.resources.sheep = 1
    player.resources.boar = 1
    player.pastures = [
      {
        id: 'p1',
        size: 1,
        tiles: [{ row: 0, col: 0 }],
        stables: 0,
        animalType: 'sheep',
        animalCount: 1,
      },
    ]
    player.houseAnimals = Object.fromEntries(player.roomTiles.slice(0, 1).map(tile => [`${tile.row}-${tile.col}`, 'boar']));
    session.loadState(state)

    const effect = session.withCtx(() => getCardEffect(CARD_ID))
    const flow = session.withCtx(() => effect!.onBuy!(state, player)) as ActionFlow
    expect(flow).toBeDefined()
    expect(flow.type).toBe('xor')
    const xor = flow as Extract<ActionFlow, { type: 'xor' }>
    expect(xor.children.length).toBe(2)
    expect(xor.children.some((child) => child.type === 'leaf' && child.params?.sheep === 1)).toBe(true)
    expect(
      xor.children.some((child) =>
        child.type === 'seq' &&
        child.children.some((nested) => nested.type === 'leaf' && nested.params?.boar === 1)),
    ).toBe(true)
    expect(
      xor.children.some((child) =>
        child.type === 'seq' &&
        child.children.some((nested) => nested.type === 'leaf' && nested.params?.cattle === 1)),
    ).toBe(false)
  })
})

describe('ae-negative-25-trough', () => {
  const { CARD, sessions, save, ok, finish, menu, make, purchase, animal } = audit25Trough
  afterEach(()=>sessions.splice(0).forEach(s=>s.dispose()))
  it('C009 N1 actual one wood purchase gains one selected legally housed animal for exact zero one or two food',()=>{for(const[type,cost]of[['sheep',0],['boar',1],['cattle',2]]as const){const s=make(),a=purchase(s),r=animal(s,a.chosen,type);assert.equal(r.state.players[0]!.resources.wood,0);assert.equal(r.state.players[0]!.resources.food,2-cost);assert.equal(r.state.players[0]!.resources[type],1);assert.equal(['sheep','boar','cattle'].reduce((n,k)=>n+r.state.players[0]!.resources[k as 'sheep'],0),1);assert.equal(r.state.players[1]!.resources[type],0);assert.ok(r.state.players[1]!.minorHand.includes(CARD));save(`C009-N1-${type}`,{a,r})}})
  it('C009 N2 optional decline or occupied household cannot replace an existing animal or create excess animals',()=>{for(const occupied of[false,true]){const s=make(2,1,occupied),a=purchase(s),r=finish(s,a.chosen,false);assert.equal(r.state.players[0]!.resources.wood,0);assert.equal(r.state.players[0]!.resources.food,2);assert.equal(r.state.players[0]!.resources.sheep,occupied?1:0);assert.equal(r.state.players[0]!.resources.boar,0);assert.equal(r.state.players[0]!.resources.cattle,0);save(`C009-N2-${occupied}`,{a,r})}})
  it('C009 N3 missing wood refuses card and zero food permits only the free sheep with unknown branch rejected',()=>{const ss=make(2,0),pending=menu(ss),error=assertRejectedUnchanged(ss,()=>ss.resolveChoice(0,CARD)),alternative=finish(ss,ok(ss.resolveChoice(0,'B004_WoodPile')),false);assert.ok(alternative.state.players[0]!.minorHand.includes(CARD));save('C009-N3-wood',{pending,error,alternative});const s=make(0),a=purchase(s),unknown=assertRejectedUnchanged(s,()=>s.resolveChoice(0,'missing-animal')),r=animal(s,a.chosen,'sheep');assert.equal(r.state.players[0]!.resources.food,0);assert.equal(r.state.players[0]!.resources.sheep,1);assert.equal(r.state.players[0]!.resources.boar,0);assert.equal(r.state.players[0]!.resources.cattle,0);save('C009-N3-food',{a,unknown,r})})
  it('C009 N4 whole cattle purchase undo restores wood food animals and passing hand before one sheep replay',()=>{const s=make(),a=purchase(s),r=animal(s,a.chosen,'cattle'),undone=ok(s.undoAction());assert.equal(undone.state.players[0]!.resources.wood,1);assert.equal(undone.state.players[0]!.resources.food,2);assert.equal(undone.state.players[0]!.resources.cattle,0);assert.ok(undone.state.players[0]!.minorHand.includes(CARD));const second=purchase(s),retry=animal(s,second.chosen,'sheep');assert.equal(retry.state.players[0]!.resources.sheep,1);assert.equal(retry.state.players[0]!.resources.food,2);save('C009-N4',{a,r,undone,second,retry})})
})
