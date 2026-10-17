import { describe, expect, it, afterEach } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { getCardEffect } from '../../shared/cards/card-effects'
import { setWorkersAtHome } from '../../shared/domain/player'

import '../../shared/cards/D/D154_ChimneySweep'
import '../../shared/cards/A/A087_Conservator'
import { D154_ChimneySweep } from '../../shared/cards/D/D154_ChimneySweep'
import assert from 'node:assert/strict'
import * as audit55Phase from './_helpers/audit/ae-negative-55-phase'
import { assertRejectedUnchanged } from './_helpers/negative-rule-audit'
import * as audit55Renovation from './_helpers/audit/ae-negative-55-renovation'

const CARD_ID = 'D154_ChimneySweep'

type SetupOptions = {
  houseType?: 'wood' | 'clay' | 'stone'
  rooms?: number
  resources?: Partial<Record<string, number>>
  occupationsP1?: string[]
  p2HouseType?: 'wood' | 'clay' | 'stone'
  round?: number
}

const setup = (options: SetupOptions = {}) => {
  const session = new GameSession(42)
  const state = session.getState().state
  state.players = state.players.slice(0, 2)
  state.currentPlayerIndex = 0
  state.round = options.round ?? 5

  const p1 = state.players[0]!
  p1.occupationPlayed = options.occupationsP1 ?? [CARD_ID]
  p1.houseType = options.houseType ?? 'clay'
  p1.rooms = options.rooms ?? 2
  if (options.resources) {
    Object.assign(p1.resources, options.resources)
  }
  setWorkersAtHome(state, p1, 2)

  const p2 = state.players[1]!
  p2.houseType = options.p2HouseType ?? 'wood'

  // Placeholder hands: random minors dealt by `new GameSession()` are
  // non-deterministic. Some random cards can hook into renovation flow
  // (compute-cost / compute-choice-candidates) and shift the choice/auto
  // path between runs. Placeholder ids resolve to undefined in card
  // lookups and never participate.
  for (const p of state.players) {
    p.minorHand = ['__test_placeholder__']
    p.occupationHand = ['__test_placeholder__']
  }

  const space = state.actionSpaces.find((s) => s.id === 'house-redevelopment')
  if (space) {
    space.roundAvailable = 1
    space.takenBy = []
  }

  session.loadState(state)
  return session
}

describe('D154_ChimneySweep card definition', () => {
  it('has players: 4+ (parity)', () => {
    expect(D154_ChimneySweep.players).toBe('4+')
  })
})

describe('D154_ChimneySweep renovation cost hook', () => {
  it('UC1: clay→stone costs 2 stone less (only 2 stone for 2 rooms → 0 charged)', () => {
    const session = setup({
      houseType: 'clay',
      rooms: 2,
      resources: { stone: 3, reed: 1 },
    })

    const resp = session.takeAction(0, 'house-redevelopment')
    expect(resp.ok).toBe(true)

    const p1 = resp.state.players[0]!
    expect(p1.houseType).toBe('stone')
    // rooms=2, base cost 2 stone, D154 -2 → 0 stone charged
    expect(p1.resources.stone).toBe(3)
    expect(p1.resources.reed).toBe(0)
  })

  it('UC2: without D154 the discount does not apply', () => {
    const session = setup({
      houseType: 'clay',
      rooms: 2,
      resources: { stone: 3, reed: 1 },
      occupationsP1: [],
    })

    const resp = session.takeAction(0, 'house-redevelopment')
    expect(resp.ok).toBe(true)

    const p1 = resp.state.players[0]!
    expect(p1.houseType).toBe('stone')
    // rooms=2, base cost 2 stone, no discount
    expect(p1.resources.stone).toBe(1)
  })

  it('UC3: wood→stone (A87 Conservator direct-upgrade) also gets 2 stone discount', () => {
    const session = setup({
      houseType: 'wood',
      rooms: 2,
      resources: { stone: 2, reed: 1, clay: 0 },
      occupationsP1: [CARD_ID, 'A087_Conservator'],
    })

    // With placeholder hands the renovation path has a single affordable
    // candidate (clay tier is not affordable — clay=0; stone tier IS
    // affordable: D154 gives -2 stone, A87 enables wood→stone direct).
    // The engine auto-resolves the single option, so takeAction completes
    // without surfacing a choice.
    let resp = session.takeAction(0, 'house-redevelopment')
    if (resp.interaction.stateId === 'wait' && resp.interaction.request.kind === 'choice') {
      resp = session.resolveChoice(0, 'stone')
    }

    expect(resp.ok).toBe(true)
    const p1 = resp.state.players[0]!
    expect(p1.houseType).toBe('stone')
    // rooms=2, base cost 2 stone, D154 -2 → 0 stone charged
    expect(p1.resources.stone).toBe(2)
    expect(p1.resources.reed).toBe(0)
  })

  it('UC4: wood→clay is unaffected (no stone in base cost, clamp keeps it at 0)', () => {
    const session = setup({
      houseType: 'wood',
      rooms: 2,
      resources: { clay: 3, reed: 1, stone: 0 },
    })

    const resp = session.takeAction(0, 'house-redevelopment')
    expect(resp.ok).toBe(true)

    const p1 = resp.state.players[0]!
    expect(p1.houseType).toBe('clay')
    expect(p1.resources.clay).toBe(1)
    expect(p1.resources.stone).toBe(0)
    expect(p1.resources.reed).toBe(0)
  })
})

describe('D154_ChimneySweep bonus scoring', () => {
  const scoreContext = { reserved: {} }

  it('UC5a: +1 per other player living in stone house', () => {
    const session = setup({ p2HouseType: 'stone' })
    const state = session.getState().state
    const p1 = state.players[0]!

    const effect = session.withCtx(() => getCardEffect(CARD_ID))
    expect(effect?.computeBonusScore).toBeDefined()
    const score = session.withCtx(() => effect!.computeBonusScore!(state, p1, scoreContext))
    expect(score).toBe(1)
  })

  it('UC5b: 0 when other player is not in stone house', () => {
    const session = setup({ p2HouseType: 'clay' })
    const state = session.getState().state
    const p1 = state.players[0]!

    const score = session.withCtx(() => session.withCtx(() => getCardEffect(CARD_ID))!.computeBonusScore!(state, p1, scoreContext))
    expect(score).toBe(0)
  })

  it('UC5c: owner living in stone house does not count themselves', () => {
    const session = setup({ houseType: 'stone', p2HouseType: 'wood' })
    const state = session.getState().state
    const p1 = state.players[0]!

    const score = session.withCtx(() => session.withCtx(() => getCardEffect(CARD_ID))!.computeBonusScore!(state, p1, scoreContext))
    expect(score).toBe(0)
  })

})

describe('ae-negative-55-phase', () => {
  const { sessions, save, make, finish, score, end } = audit55Phase
  afterEach(() => sessions.splice(0).forEach(session => session.dispose()))
  it('D154 N3 real authoritative scoring counts zero through three other stone houses and always excludes owner own stone house',()=>{for(const count of[0,1,2,3]){const s=make('D154_ChimneySweep',st=>{st.players[0]!.houseType='stone';st.players.slice(1).forEach((p,i)=>p.houseType=i<count?'stone':'clay')},true,14),r=finish(s,end(s));assert.equal(r.state.gameOver,true);assert.equal(score(r,'D154_ChimneySweep'),count);save(`D154-N3-${count}`,r)}})
})

describe('ae-negative-55-renovation', () => {
  const { sessions, ok, save, make, finish, renovate } = audit55Renovation
  afterEach(() => sessions.splice(0).forEach(session => session.dispose()))
  it('D154 N1 two and three room stone renovation discount exactly two stone once and whole undo restores payment',()=>{for(const rooms of[2,3]){const s=make('D154_ChimneySweep',st=>{const p=st.players[0]!;p.houseType='clay';if(rooms===3){p.rooms=3;p.roomTiles.push({row:1,col:1});}p.resources.stone=rooms-2;p.resources.reed=1;},true,14),r=renovate(s,0,false),u=ok(s.undoAction());assert.equal(r.state.players[0]!.houseType,'stone');assert.equal(r.state.players[0]!.resources.stone,0);assert.equal(r.state.players[0]!.resources.reed,0);assert.equal(u.state.players[0]!.houseType,'clay');assert.equal(u.state.players[0]!.resources.stone,rooms-2);assert.equal(u.state.players[0]!.resources.reed,1);save(`D154-N1-${rooms}`,{r,u})}})
  it('D154 N2 wood to clay remains full price while missing reed stone renovation rejects before legal Grain Seeds',()=>{const s=make('D154_ChimneySweep',st=>{Object.assign(st.players[0]!.resources,{clay:2,reed:1});},true,14),r=renovate(s,0,false);assert.equal(r.state.players[0]!.houseType,'clay');assert.equal(r.state.players[0]!.resources.clay,0);const c=make('D154_ChimneySweep',st=>{st.players[0]!.houseType='clay'},true,14),rejected=assertRejectedUnchanged(c,()=>c.takeAction(0,'house-redevelopment')),control=finish(c,ok(c.takeAction(0,'grain-seeds')));assert.equal(control.state.players[0]!.houseType,'clay');save('D154-N2',{r,rejected,control})})
})
