import { describe, expect, it, afterEach } from 'vitest'
import { GameSession, type SessionResponse } from '../game/authoritative-session'
import { setWorkersAtHome } from '../../shared/domain/player'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'

import '../../shared/cards/B/B095_MasterBricklayer'
import '../../shared/cards/E/E047_SyrupTap'
import assert from 'node:assert/strict'
import { assertRejectedUnchanged } from './_helpers/negative-rule-audit'
import * as audit24Bricklayer from './_helpers/audit/ae-negative-24-bricklayer'

const CARD_ID = 'B095_MasterBricklayer'
const FILLER = '__test_placeholder__'

const setup = ({
  rooms = 2, played = true, wood = 0, reed = 0, stone = 0, minor = false,
} = {}) => {
  const session = new GameSession(5095, undefined, { playerCount: 2 })
  stabilizeRandomHands(session.state.players)
  const state = session.getState().state
  state.currentPlayerIndex = 0
  state.round = 6
  state.roundPhase = 'work'
  state.availableMajorImprovements = minor ? [] : ['Major_Basket']
  state.players.forEach((player) => {
    setWorkersAtHome(state, player, 2)
    player.minorHand = [FILLER]
    player.occupationHand = [FILLER]
    player.resources.food = 20
  })
  const owner = state.players[0]!
  owner.rooms = rooms
  owner.occupationPlayed = played ? [CARD_ID] : []
  owner.occupationHand = played ? [FILLER] : [CARD_ID]
  owner.minorHand = minor ? ['E047_SyrupTap'] : [FILLER]
  owner.resources = {
    ...owner.resources,
    wood, clay: 0, reed, stone, grain: 0, vegetable: 0, sheep: 0, boar: 0, cattle: 0,
  }
  session.loadState(state)
  return session
}

const chooseCard = (session: GameSession, response: SessionResponse, cardId: string) => {
  if (response.interaction.stateId !== 'wait') return response
  const option = response.interaction.request.options?.find((candidate) => candidate.value === cardId)
  return option ? session.resolveChoice(response.interaction.playerIndex, option.value) : response
}

const buyBasket = (session: GameSession) =>
  chooseCard(session, session.takeAction(0, 'major-improvement'), 'Major_Basket')

const playMinor = (session: GameSession) => {
  let response = session.takeAction(0, 'meeting-place')
  if (response.interaction.stateId === 'wait') {
    const improvement = response.interaction.request.options?.find((option) =>
      option.value.startsWith('action-improvement-'))
    if (improvement) response = session.resolveChoice(response.interaction.playerIndex, improvement.value)
  }
  return chooseCard(session, response, 'E047_SyrupTap')
}

describe('B095 Master Bricklayer parity', () => {
  it('B095 S1: playing Master Bricklayer through Lessons leaves it in play', () => {
    const session = setup({ played: false })
    const response = chooseCard(session, session.takeAction(0, 'lessons'), CARD_ID)

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.occupationPlayed).toContain(CARD_ID)
  })

  it('B095 S2: with only the two initial rooms Master Bricklayer gives no major stone discount', () => {
    const response = buyBasket(setup({ reed: 2, stone: 2 }))

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.improvements).toContain('Major_Basket')
    expect(response.state.players[0]!.resources).toMatchObject({ reed: 0, stone: 0 })
  })

  it('B095 S3: one room built onto the initial house reduces a major cost by one stone', () => {
    const response = buyBasket(setup({ rooms: 3, reed: 2, stone: 1 }))

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.improvements).toContain('Major_Basket')
    expect(response.state.players[0]!.resources).toMatchObject({ reed: 0, stone: 0 })
  })

  it('B095 S4: two added rooms reduce a two-stone major cost to zero without creating stone', () => {
    const response = buyBasket(setup({ rooms: 4, reed: 2 }))

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.improvements).toContain('Major_Basket')
    expect(response.state.players[0]!.resources).toMatchObject({ reed: 0, stone: 0 })
  })

  it('B095 S5: added rooms do not discount the stone cost of a minor improvement', () => {
    const response = playMinor(setup({ rooms: 4, wood: 1, stone: 1, minor: true }))

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.minorPlayed).toContain('E047_SyrupTap')
    expect(response.state.players[0]!.resources).toMatchObject({ wood: 0, stone: 0 })
  })
})

describe('ae-negative-24-bricklayer', () => {
  const { sessions, save, ok, finish, make, majorMenu, purchase } = audit24Bricklayer
  afterEach(()=>sessions.splice(0).forEach(s=>s.dispose()))
  it('B095 N1 actual Joinery pays two wood and zero one or two stone discount for two three four legal rooms',()=>{for(const rooms of[2,3,4]){const s=make(rooms,true,2,2),a=purchase(s,'Major_Joinery');assert.equal(a.r.state.players[0]!.resources.wood,0);assert.equal(a.r.state.players[0]!.resources.stone,rooms-2);assert.equal(a.r.state.players[0]!.rooms,rooms);assert.equal(a.r.state.players[1]!.resources.stone,0);save(`B095-N1-${rooms}`,a)}})
  it('B095 N2 discounts floor stone at zero and never discount the remaining wood or clay component',()=>{const s=make(4,true,2,0),a=purchase(s,'Major_Joinery');assert.equal(a.r.state.players[0]!.resources.stone,0);assert.equal(a.r.state.players[0]!.resources.wood,0);save('B095-N2-floor',a);for(const mode of['wood','clay']){const ss=make(4,true,mode==='wood'?1:2,0,mode==='clay'?2:0),pending=majorMenu(ss),card=mode==='wood'?'Major_Joinery':'Major_ClayOven',error=assertRejectedUnchanged(ss,()=>ss.resolveChoice(0,card)),r=finish(ss,ok(ss.resolveChoice(0,'B004_WoodPile')),false);assert.ok(!r.state.players[0]!.improvements.includes(card));assert.equal(r.state.players[0]!.resources.stone,0);assert.equal(r.state.players[0]!.resources.clay,mode==='clay'?2:0);save(`B095-N2-${mode}`,{pending,error,r})}})
  it('B095 N3 stone cost minor and card in hand receive no discount and retain legal free alternative',()=>{for(const mode of['minor','hand']){const s=make(4,mode!=='hand',2,0),pending=majorMenu(s),card=mode==='minor'?'B033_Mantlepiece':'Major_Joinery',error=assertRejectedUnchanged(s,()=>s.resolveChoice(0,card)),r=finish(s,ok(s.resolveChoice(0,'B004_WoodPile')),false);assert.equal(r.state.players[0]!.resources.stone,0);assert.ok(!r.state.players[0]!.improvements.includes('Major_Joinery'));assert.ok(r.state.players[0]!.minorHand.includes('B033_Mantlepiece'));save(`B095-N3-${mode}`,{pending,error,r})}})
  it('B095 N4 whole discounted purchase undo restores resource payment and public major availability before one replay',()=>{const s=make(),before=ok(s.getState()),a=purchase(s,'Major_Joinery'),undone=ok(s.undoAction());assert.equal(undone.state.players[0]!.resources.wood,2);assert.equal(undone.state.players[0]!.resources.stone,1);assert.ok(!undone.state.players[0]!.improvements.includes('Major_Joinery'));assert.deepEqual(undone.state.availableMajorImprovements,before.state.availableMajorImprovements);const retry=purchase(s,'Major_Joinery');assert.equal(retry.r.state.players[0]!.resources.wood,0);assert.equal(retry.r.state.players[0]!.resources.stone,0);save('B095-N4',{before,a,undone,retry})})
})
