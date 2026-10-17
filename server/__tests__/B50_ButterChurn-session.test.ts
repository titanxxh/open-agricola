import { describe, expect, it, afterEach } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { runCardEffectHook } from '../../shared/cards/card-effects'

import '../../shared/cards/B/B050_ButterChurn'
import type { ActionFlow } from '../../shared/contract/types'
import assert from 'node:assert/strict'
import type { GameState } from '../../shared/contract/types'
import { assertRejectedUnchanged } from './_helpers/negative-rule-audit'
import * as audit20Harvest from './_helpers/audit/ae-negative-20-harvest'

describe('B050_ButterChurn — onHarvestFieldPhase uses on-board sheep+cattle (not reserve)', () => {
  const setup = () => {
    const session = new GameSession(42)
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    state.currentPlayerIndex = 0
    const player = state.players[0]!
    player.minorPlayed.push('B050_ButterChurn')
    return session
  }

  it('reserve only animals: no food', () => {
    const session = setup()
    const state = session.getState().state
    const player = state.players[0]!
    player.resources.sheep = 6
    player.resources.cattle = 4
    const flow = session.withCtx(() => runCardEffectHook(state, player, 'B050_ButterChurn', 'onHarvestFieldPhase'))
    expect(flow).toBeNull()
  })

  it('3 sheep on board: +1 food', () => {
    const session = setup()
    const state = session.getState().state
    const player = state.players[0]!
    player.pastures = [
      { id: 'pa-1', size: 2, tiles: [], stables: 0, animalType: 'sheep', animalCount: 3 },
    ]
    player.resources.sheep = 3
    const flow = session.withCtx(() => runCardEffectHook(state, player, 'B050_ButterChurn', 'onHarvestFieldPhase'))
    const leaf = flow as Extract<ActionFlow, { type: 'leaf' }>
    expect(leaf.actionId).toBe('gain')
    expect(leaf.params).toEqual({ food: 1 })
  })

  it('2 cattle on board: +1 food', () => {
    const session = setup()
    const state = session.getState().state
    const player = state.players[0]!
    player.pastures = [
      { id: 'pa-1', size: 2, tiles: [], stables: 0, animalType: 'cattle', animalCount: 2 },
    ]
    player.resources.cattle = 2
    const flow = session.withCtx(() => runCardEffectHook(state, player, 'B050_ButterChurn', 'onHarvestFieldPhase'))
    const leaf = flow as Extract<ActionFlow, { type: 'leaf' }>
    expect(leaf.params).toEqual({ food: 1 })
  })

  it('6 sheep + 4 cattle on board: 2 + 2 = 4 food', () => {
    const session = setup()
    const state = session.getState().state
    const player = state.players[0]!
    player.pastures = [
      { id: 'pa-1', size: 3, tiles: [], stables: 0, animalType: 'sheep', animalCount: 6 },
      { id: 'pa-2', size: 2, tiles: [], stables: 0, animalType: 'cattle', animalCount: 4 },
    ]
    player.resources.sheep = 6
    player.resources.cattle = 4
    const flow = session.withCtx(() => runCardEffectHook(state, player, 'B050_ButterChurn', 'onHarvestFieldPhase'))
    const leaf = flow as Extract<ActionFlow, { type: 'leaf' }>
    expect(leaf.params).toEqual({ food: 4 })
  })

  it('mixed (placed 3 sheep + reserve 5 sheep): +1 food (placed only)', () => {
    const session = setup()
    const state = session.getState().state
    const player = state.players[0]!
    player.pastures = [
      { id: 'pa-1', size: 1, tiles: [], stables: 0, animalType: 'sheep', animalCount: 3 },
    ]
    player.resources.sheep = 8
    const flow = session.withCtx(() => runCardEffectHook(state, player, 'B050_ButterChurn', 'onHarvestFieldPhase'))
    const leaf = flow as Extract<ActionFlow, { type: 'leaf' }>
    expect(leaf.params).toEqual({ food: 1 })
  })

  it('counts sheep hosted on other players Night Pastures', () => {
    const session = new GameSession(50050, undefined, {
      playerCount: 4,
      enableFarmersOfTheMoor: true,
      allowIncompleteFarmersOfTheMoorMinorDeal: true,
    })
    const state = session.getState().state
    const player = state.players[0]!
    player.minorPlayed = ['B050_ButterChurn']
    player.resources.sheep = 3
    state.players.slice(1).forEach((owner, index) => {
      owner.name = `Owner${index}`
      owner.minorPlayed = ['M033_NightPasture']
      const zoneId = `card:M033_NightPasture:owner:${owner.id}:animalOwner:${player.id}`
      owner.cardStates = {
        M033_NightPasture: {
          extraData: {
            animalCountsByZone: {
              [zoneId]: {
                animalCounts: { sheep: 1 },
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
    })

    const flow = session.withCtx(() => runCardEffectHook(state, player, 'B050_ButterChurn', 'onHarvestFieldPhase'))

    const leaf = flow as Extract<ActionFlow, { type: 'leaf' }>
    expect(leaf.params).toEqual({ food: 1 })
  })
})

describe('ae-negative-20-harvest', () => {
  const { CHURN, OCCS, sessions, save, ok, setup, habitat, menu, buy, end } = audit20Harvest
  afterEach(()=>sessions.splice(0).forEach(s=>s.dispose()))
  it('B050 N1 real one wood purchase accepts zero or three occupations and rejects four or no wood',()=>{for(const occupations of[0,3]){const s=setup(CHURN,state=>{state.players[0]!.occupationPlayed=OCCS.slice(0,occupations);state.players[0]!.resources.wood=1}),{pending,r}=buy(s,CHURN);assert.equal(r.state.players[0]!.resources.wood,0);assert.equal(r.state.players[0]!.resources.food,100);assert.equal(r.scores![0]!.categories.find(c=>c.key==='cards')!.entries.find(e=>'cardId'in e&&e.cardId===CHURN)!.score,1);save(`B050-N1-${occupations}`,{pending,r})}for(const[wood,n]of[[0,0],[1,4]]){const s=setup(CHURN,state=>{state.players[0]!.resources.wood=wood!;state.players[0]!.occupationPlayed=OCCS.slice(0,n)}),pending=menu(s);assertRejectedUnchanged(s,()=>s.resolveChoice(0,CHURN));const legal=ok(s.resolveChoice(0,'B004_WoodPile'));assert.equal(legal.state.players[0]!.resources.food,100);save(`B050-N1-refuse-${wood}-${n}`,{pending,legal})}})
  it('B050 N2 natural harvest floors sheep thirds and cattle halves independently before breeding',()=>{for(const[sheep,cattle]of[[0,0],[2,1],[3,1],[5,3],[6,4],[7,5]]){const configure=(state:GameState)=>habitat(state,sheep,cattle),on=end(setup(CHURN,configure,true)),off=end(setup(CHURN,configure,false));assert.equal(on.r.state.players[0]!.resources.food-off.r.state.players[0]!.resources.food,Math.floor(sheep!/3)+Math.floor(cattle!/2));assert.equal(on.r.state.players[1]!.resources.food,off.r.state.players[1]!.resources.food);assert.equal(on.r.state.round,5);save(`B050-N2-${sheep}-${cattle}`,{on,off})}})
  it('B050 N3 hand nonharvest opponent sheep cattle and own boar cannot grant Butter Churn food',()=>{const on=end(setup(CHURN,state=>habitat(state,6,4),true,3)),off=end(setup(CHURN,state=>habitat(state,6,4),false,3));assert.equal(on.r.state.players[0]!.resources.food,off.r.state.players[0]!.resources.food);const other=end(setup(CHURN,state=>habitat(state,6,4,1),true)),control=end(setup(CHURN,state=>habitat(state,6,4,1),false));assert.equal(other.r.state.players[0]!.resources.food,control.r.state.players[0]!.resources.food);const pigs=end(setup(CHURN,state=>{const p=state.players[0]!;p.resources.boar=1;p.houseAnimals = { '2-0': 'boar' }},true)),no=end(setup(CHURN,()=>{},false));assert.equal(pigs.r.state.players[0]!.resources.food,no.r.state.players[0]!.resources.food);save('B050-N3',{on,off,other,control,pigs,no})})
  it('B050 N4 actual purchase undo restores one wood and retry does not duplicate card or immediate food',()=>{const s=setup(CHURN,state=>state.players[0]!.resources.wood=1),r=buy(s,CHURN).r,undone=ok(s.undoAction());assert.equal(undone.state.players[0]!.resources.wood,1);assert.ok(undone.state.players[0]!.minorHand.includes(CHURN));const retry=buy(s,CHURN).r;assert.equal(retry.state.players[0]!.resources.food,100);assert.equal(retry.state.players[0]!.minorPlayed.filter(id=>id===CHURN).length,1);save('B050-N4',{r,undone,retry})})
})
