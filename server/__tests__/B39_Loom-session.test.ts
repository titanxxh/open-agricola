import type { GameSession as SessionRuleOwner } from '../game/authoritative-session'
import { describe, expect, it, afterEach } from 'vitest'
import { GameSession, type SessionResponse } from '../game/authoritative-session'
import { runCardEffectHook, getCardEffect } from '../../shared/cards/card-effects'

import '../../shared/cards/B/B039_Loom'
import type { ActionFlow } from '../../shared/contract/types'
import assert from 'node:assert/strict'
import type { GameState } from '../../shared/contract/types'
import { assertRejectedUnchanged } from './_helpers/negative-rule-audit'
import * as audit20Harvest from './_helpers/audit/ae-negative-20-harvest'

describe('B039_Loom — onHarvestFieldPhase uses on-board sheep (not reserve)', () => {
  const setup = () => {
    const session = new GameSession(42)
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    state.currentPlayerIndex = 0
    const player = state.players[0]!
    player.minorPlayed.push('B039_Loom')
    return session
  }

  it('reserve sheep only (no placed): no food', () => {
    const session = setup()
    const state = session.getState().state
    const player = state.players[0]!
    player.resources.sheep = 5 // all in reserve
    // pastures / house / stable empty
    const flow = session.withCtx(() => runCardEffectHook(state, player, 'B039_Loom', 'onHarvestFieldPhase'))
    expect(flow).toBeNull()
  })

  it('1 sheep on board (pasture): +1 food', () => {
    const session = setup()
    const state = session.getState().state
    const player = state.players[0]!
    player.pastures = [
      { id: 'pa-1', size: 1, tiles: [], stables: 0, animalType: 'sheep', animalCount: 1 },
    ]
    player.resources.sheep = 1
    const flow = session.withCtx(() => runCardEffectHook(state, player, 'B039_Loom', 'onHarvestFieldPhase'))
    expect(flow).not.toBeNull()
    const leaf = flow as Extract<ActionFlow, { type: 'leaf' }>
    expect(leaf.actionId).toBe('gain')
    expect(leaf.params).toEqual({ food: 1 })
  })

  it('4 sheep on board: +2 food', () => {
    const session = setup()
    const state = session.getState().state
    const player = state.players[0]!
    player.pastures = [
      { id: 'pa-1', size: 2, tiles: [], stables: 1, animalType: 'sheep', animalCount: 4 },
    ]
    player.resources.sheep = 4
    const flow = session.withCtx(() => runCardEffectHook(state, player, 'B039_Loom', 'onHarvestFieldPhase'))
    const leaf = flow as Extract<ActionFlow, { type: 'leaf' }>
    expect(leaf.params).toEqual({ food: 2 })
  })

  it('7 sheep on board (mixed sources): +3 food', () => {
    const session = setup()
    const state = session.getState().state
    const player = state.players[0]!
    player.pastures = [
      { id: 'pa-1', size: 3, tiles: [], stables: 0, animalType: 'sheep', animalCount: 5 },
    ]
    player.houseAnimals = Object.fromEntries(player.roomTiles.slice(0, 1).map(tile => [`${tile.row}-${tile.col}`, 'sheep']));
    player.stableAnimals = { 's-1': { animalType: 'sheep', animalCount: 1 } }
    player.resources.sheep = 7
    const flow = session.withCtx(() => runCardEffectHook(state, player, 'B039_Loom', 'onHarvestFieldPhase'))
    const leaf = flow as Extract<ActionFlow, { type: 'leaf' }>
    expect(leaf.params).toEqual({ food: 3 })
  })

  it('mixed: 3 placed + 5 reserve → +1 food (only on-board counts)', () => {
    const session = setup()
    const state = session.getState().state
    const player = state.players[0]!
    player.pastures = [
      { id: 'pa-1', size: 1, tiles: [], stables: 0, animalType: 'sheep', animalCount: 3 },
    ]
    player.resources.sheep = 8
    const flow = session.withCtx(() => runCardEffectHook(state, player, 'B039_Loom', 'onHarvestFieldPhase'))
    const leaf = flow as Extract<ActionFlow, { type: 'leaf' }>
    expect(leaf.params).toEqual({ food: 1 })
  })

  it('counts sheep hosted on another player Night Pasture', () => {
    const session = setup()
    const state = session.getState().state
    const player = state.players[0]!
    const owner = state.players[1]!
    const zoneId = `card:M033_NightPasture:owner:${owner.id}:animalOwner:${player.id}`
    owner.cardStates = {
      M033_NightPasture: {
        extraData: {
          animalCountsByZone: {
            [zoneId]: {
              animalCounts: { sheep: 4 },
              ownerPlayerId: owner.id,
              animalOwnerPlayerId: player.id,
              cardId: 'M033_NightPasture',
              capacity: 1,
              allowedAnimalType: null,
            },
          },
        },
      },
    }

    const flow = session.withCtx(() => runCardEffectHook(state, player, 'B039_Loom', 'onHarvestFieldPhase'))

    const leaf = flow as Extract<ActionFlow, { type: 'leaf' }>
    expect(leaf.params).toEqual({ food: 2 })
  })
})

describe('B039_Loom — computeBonusScore uses on-board sheep', () => {
  const score = (ruleOwner: SessionRuleOwner, state: ReturnType<GameSession['getState']>['state'], player: ReturnType<GameSession['getState']>['state']['players'][number]) => {
    const effect = ruleOwner.withCtx(() => getCardEffect('B039_Loom'))
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return ruleOwner.withCtx(() => effect!.computeBonusScore!(state, player, undefined as any))
  }

  it('reserve only 6 sheep: 0 VP', () => {
    const session = new GameSession(42)
    const state = session.getState().state
    const player = state.players[0]!
    player.resources.sheep = 6
    expect(score(session, state, player)).toBe(0)
  })

  it('6 sheep on board: 2 VP', () => {
    const session = new GameSession(42)
    const state = session.getState().state
    const player = state.players[0]!
    player.pastures = [
      { id: 'pa-1', size: 3, tiles: [], stables: 0, animalType: 'sheep', animalCount: 6 },
    ]
    expect(score(session, state, player)).toBe(2)
  })

  it('counts sheep hosted on another player Night Pasture', () => {
    const session = new GameSession(42)
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    const player = state.players[0]!
    const owner = state.players[1]!
    const zoneId = `card:M033_NightPasture:owner:${owner.id}:animalOwner:${player.id}`
    owner.cardStates = {
      M033_NightPasture: {
        extraData: {
          animalCountsByZone: {
            [zoneId]: {
              animalCounts: { sheep: 3 },
              ownerPlayerId: owner.id,
              animalOwnerPlayerId: player.id,
              cardId: 'M033_NightPasture',
              capacity: 1,
              allowedAnimalType: null,
            },
          },
        },
      },
    }

    expect(score(session, state, player)).toBe(1)
  })
})

describe('ae-negative-20-harvest', () => {
  const { LOOM, OCCS, sessions, save, ok, setup, habitat, menu, buy, end, bonus } = audit20Harvest
  afterEach(()=>sessions.splice(0).forEach(s=>s.dispose()))
  it('B039 N1 real Loom purchase pays two wood and needs two occupations as shown by rulebook card image',()=>{const s=setup(LOOM,state=>state.players[0]!.resources.wood=2),{pending,r}=buy(s,LOOM);assert.equal(r.state.players[0]!.resources.wood,0);assert.equal(r.state.players[0]!.resources.food,100);assert.equal(r.scores![0]!.categories.find(c=>c.key==='cards')!.entries.find(e=>'cardId'in e&&e.cardId===LOOM)!.score,1);save('B039-N1',{pending,r,ruleSource:'Official rulebook page11 image shows2wood; frozenCSV1wood retained as source discrepancy'});for(const[wood,occupations]of[[1,2],[2,1],[2,0]]){const ss=setup(LOOM,state=>{state.players[0]!.resources.wood=wood!;state.players[0]!.occupationPlayed=OCCS.slice(0,occupations)}),denied=menu(ss);assertRejectedUnchanged(ss,()=>ss.resolveChoice(0,LOOM));const legal=ok(ss.resolveChoice(0,'B004_WoodPile'));assert.equal(bonus(legal),0);save(`B039-N1-${wood}-${occupations}`,{denied,legal})}})
  it('B039 N2 natural harvest field phase uses sheep thresholds one four seven before breeding',()=>{for(const sheep of[0,1,3,4,6,7,8,9]){const configure=(state:GameState)=>habitat(state,sheep),s=setup(LOOM,configure,true),control=setup(LOOM,configure,false),before=JSON.parse(JSON.stringify(s.getState())) as SessionResponse,on=end(s),off=end(control),income=sheep>=7?3:sheep>=4?2:sheep>=1?1:0;assert.equal(on.r.state.players[0]!.resources.food-off.r.state.players[0]!.resources.food,income);assert.equal(on.r.state.players[1]!.resources.food,off.r.state.players[1]!.resources.food);assert.equal(bonus(before),Math.floor(sheep/3));assert.equal(on.r.state.round,5);save(`B039-N2-${sheep}`,{before,on,off,income})}})
  it('B039 N3 nonharvest and card in hand or only opponent sheep never grant Loom food or owner bonus',()=>{const on=end(setup(LOOM,state=>habitat(state,7),true,3)),off=end(setup(LOOM,state=>habitat(state,7),false,3));assert.equal(on.r.state.players[0]!.resources.food,off.r.state.players[0]!.resources.food);const other=end(setup(LOOM,state=>habitat(state,7,0,1),true)),control=end(setup(LOOM,state=>habitat(state,7,0,1),false));assert.equal(other.r.state.players[0]!.resources.food,control.r.state.players[0]!.resources.food);assert.equal(bonus(other.r),0);save('B039-N3',{on,off,other,control})})
  it('B039 N4 real purchase undo restores cost hand printed point and exactly one retry',()=>{const s=setup(LOOM,state=>state.players[0]!.resources.wood=2),r=buy(s,LOOM).r,undone=ok(s.undoAction());assert.equal(undone.state.players[0]!.resources.wood,2);assert.ok(undone.state.players[0]!.minorHand.includes(LOOM));const retry=buy(s,LOOM).r;assert.equal(retry.state.players[0]!.resources.wood,0);assert.equal(retry.state.players[0]!.minorPlayed.filter(id=>id===LOOM).length,1);save('B039-N4',{r,undone,retry})})
})
