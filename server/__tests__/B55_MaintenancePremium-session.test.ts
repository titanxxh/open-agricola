import { describe, expect, it, afterEach } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'
import { readCardExtraData } from '../../shared/cards/helpers/card-state'

import { setWorkersAtHome } from '../../shared/domain/player'
import '../../shared/cards/B/B055_MaintenancePremium'
import assert from 'node:assert/strict'
import { assertRejectedUnchanged } from './_helpers/negative-rule-audit'
import * as audit21Maintenance from './_helpers/audit/ae-negative-21-maintenance'

const CARD_ID = 'B055_MaintenancePremium'

const setup = () => {
  const session = new GameSession(42)
  stabilizeRandomHands(session.state.players)
  const state = session.getState().state
  state.players = state.players.slice(0, 2)
  state.currentPlayerIndex = 0
  state.round = 1

  const player = state.players[0]!
  setWorkersAtHome(state, player, 2)
  player.resources.food = 10
  player.resources.wood = 10
  player.resources.clay = 10
  player.resources.reed = 10
  player.resources.stone = 10

  // Manually add card
  player.minorPlayed.push(CARD_ID)
  if (!player.cardStates) player.cardStates = {}
  player.cardStates[CARD_ID] = {
    extraData: { foodCount: 3 },
    infobox: '3 Food',
  }

  // Put wood on forest space
  const forest = state.actionSpaces.find((s) => s.id === 'forest')
  if (forest) forest.resources.wood = 6

  session.loadState(state)
  return session
}

describe('B055_MaintenancePremium session', () => {
  it('onBuy sets foodCount to 3', () => {
    const session = new GameSession(42)
    stabilizeRandomHands(session.state.players)
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    const player = state.players[0]!
    player.minorHand.push(CARD_ID)
    session.loadState(state)
    session.devPlayCard(0, CARD_ID)

    const updated = session.getState().state.players[0]!
    expect(readCardExtraData<number>(updated, CARD_ID, 'foodCount')).toBe(3)
  })

  it('using wood accumulation space releases 1 food from card', () => {
    const session = setup()
    const foodBefore = session.getState().state.players[0]!.resources.food

    const resp = session.takeAction(0, 'forest')
    expect(resp.ok).toBe(true)

    const player = resp.state.players[0]!
    expect(readCardExtraData<number>(player, CARD_ID, 'foodCount')).toBe(2)
    expect(player.resources.food).toBe(foodBefore + 1)
  })

  it('does not release food when card is empty', () => {
    const session = setup()
    const state = session.getState().state
    state.players[0]!.cardStates![CARD_ID]!.extraData!.foodCount = 0
    session.loadState(state)

    const foodBefore = state.players[0]!.resources.food
    const resp = session.takeAction(0, 'forest')
    expect(resp.ok).toBe(true)

    expect(resp.state.players[0]!.resources.food).toBe(foodBefore)
    expect(readCardExtraData<number>(resp.state.players[0]!, CARD_ID, 'foodCount')).toBe(0)
  })

  it('renovation restocks foodCount to 3', () => {
    const session = setup()

    // Deplete foodCount first
    const state = session.getState().state
    state.players[0]!.cardStates![CARD_ID]!.extraData!.foodCount = 0
    // Set round to when house-redevelopment is available
    state.round = 6
    const player = state.players[0]!
    player.houseType = 'wood'
    player.rooms = 2
    player.resources.clay = 10
    player.resources.reed = 10
    setWorkersAtHome(state, player, 2)
    session.loadState(state)

    // Take house-redevelopment action (renovation + minor improvement)
    const resp = session.takeAction(0, 'house-redevelopment')
    expect(resp.ok).toBe(true)

    // After renovation, foodCount should be restocked to 3
    const updated = resp.state.players[0]!
    expect(readCardExtraData<number>(updated, CARD_ID, 'foodCount')).toBe(3)
  })
})

describe('ae-negative-21-maintenance', () => {
  const { CARD, OCCS, sessions, save, ok, setup, turn, purchaseMenu, buy, owner, reach, stored } = audit21Maintenance
  afterEach(()=>sessions.splice(0).forEach(s=>s.dispose()))
  it('B055 N1 actual free two occupation purchase stores three food without supply gain and missing occupation rejects',()=>{const s=setup(CARD),{pending,r}=buy(s,CARD);assert.equal(stored(r),3);assert.equal(r.state.players[0]!.resources.food,100);for(const n of[0,1]){const p=setup(CARD,state=>state.players[0]!.occupationPlayed=OCCS.slice(0,n)),denied=purchaseMenu(p);assertRejectedUnchanged(p,()=>p.resolveChoice(0,CARD));const legal=ok(p.resolveChoice(0,'B004_WoodPile'));assert.equal(stored(legal),0);save(`B055-N1-${n}`,{denied,legal})}save('B055-N1',{pending,r})})
  it('B055 N2 four actual Forest uses across natural rounds deplete three stored food exactly one one one zero',()=>{const s=setup(CARD,()=>{},5);buy(s,CARD);const results=[];for(const round of[5,6,7,8]){if(round>5)reach(s,round);const before=owner(s),r=turn(s,0,'forest');assert.equal(stored(r),Math.max(0,7-round));assert.equal(r.state.players[0]!.resources.food,before.state.players[0]!.resources.food+(round<8?1:0));results.push({before,r})}save('B055-N2',results)})
  it('B055 N3 actual renovation restocks a partly depleted or empty card to three rather than adding three food',()=>{for(const uses of[1,3]){const s=setup(CARD,state=>{state.players[0]!.resources.clay=2;state.players[0]!.resources.reed=1},5);buy(s,CARD);for(let n=0;n<uses;n++){if(n)reach(s,5+n);owner(s);turn(s,0,'forest')}reach(s,8);const before=owner(s),r=turn(s,0,'house-redevelopment');assert.equal(r.state.players[0]!.houseType,'clay');assert.equal(stored(r),3);assert.equal(r.state.players[0]!.resources.clay,before.state.players[0]!.resources.clay-2);assert.equal(r.state.players[0]!.resources.reed,0);assert.equal(r.state.players[0]!.resources.food,before.state.players[0]!.resources.food);const undone=ok(s.undoAction());assert.equal(undone.state.players[0]!.houseType,'wood');assert.equal(stored(undone),3-uses);assert.equal(undone.state.players[0]!.resources.clay,before.state.players[0]!.resources.clay);assert.equal(undone.state.players[0]!.resources.reed,1);const retry=turn(s,0,'house-redevelopment');assert.equal(stored(retry),3);save(`B055-N3-${uses}`,{before,r,undone,retry})}})
  it('B055 N4 quarry unrelated collection opponent Forest and hand card cannot consume or restock stored food',()=>{const h=turn(setup(CARD),0,'forest');assert.equal(stored(h),0);const s=setup(CARD);buy(s,CARD);const other=turn(s,1,'forest'),unrelated=turn(s,0,'reed-bank');assert.equal(stored(other),3);assert.equal(stored(unrelated),3);reach(s,9);const before=owner(s),quarry=turn(s,0,'western-quarry');assert.equal(stored(quarry),3);assert.equal(quarry.state.players[0]!.resources.food,before.state.players[0]!.resources.food);save('B055-N4',{h,other,unrelated,before,quarry})})
  it('B055 N5 whole purchase and actual Forest undo restore stored food and one legal replay grants only once',()=>{const s=setup(CARD),r=buy(s,CARD).r,undone=ok(s.undoAction());assert.equal(stored(undone),0);assert.ok(undone.state.players[0]!.minorHand.includes(CARD));buy(s,CARD);const before=owner(s),wood=turn(s,0,'forest'),u=ok(s.undoAction());assert.equal(stored(u),3);assert.equal(u.state.players[0]!.resources.food,before.state.players[0]!.resources.food);const retry=turn(s,0,'forest');assert.equal(stored(retry),2);assert.equal(retry.state.players[0]!.resources.food,before.state.players[0]!.resources.food+1);save('B055-N5',{r,undone,before,wood,u,retry})})
})
