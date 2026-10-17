import { describe, expect, it, afterEach } from 'vitest'
import { GameSession, type SessionResponse } from '../game/authoritative-session'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'

import '../../shared/cards/E/E002_RenovationMaterials'
import assert from 'node:assert/strict'
import { assertRejectedUnchanged } from './_helpers/negative-rule-audit'
import * as audit23Renovation from './_helpers/audit/ae-negative-23-renovation'

const CARD_ID = 'E002_RenovationMaterials'
const FIXED_HANDS = [
  { occupation: '__test_occupation_p1__', minor: CARD_ID },
  { occupation: '__test_occupation_p2__', minor: '__test_minor_p2__' },
  { occupation: '__test_occupation_p3__', minor: '__test_minor_p3__' },
  { occupation: '__test_occupation_p4__', minor: '__test_minor_p4__' },
]

const setup = (options: {
  clay: number
  reed: number
  houseType?: 'wood' | 'clay' | 'stone'
}) => {
  const session = new GameSession(2, undefined, { playerCount: 4 })
  stabilizeRandomHands(session.state.players)
  const state = session.getState().state
  state.currentPlayerIndex = 0
  state.round = 1
  state.roundPhase = 'work'
  state.players.forEach((player, index) => {
    player.occupationHand = [FIXED_HANDS[index]!.occupation]
    player.minorHand = [FIXED_HANDS[index]!.minor]
  })
  const player = state.players[0]!
  player.houseType = options.houseType ?? 'wood'
  player.resources.clay = options.clay
  player.resources.reed = options.reed
  session.loadState(state)
  return session
}

const openMinorPrompt = (session: GameSession) => {
  let response = session.takeAction(0, 'meeting-place')
  expect(response.ok, response.error).toBe(true)
  if (response.interaction.stateId !== 'wait') return response
  if (response.interaction.request.options?.some((option) => option.value === CARD_ID)) return response
  const improvement = response.interaction.request.options?.find((option) =>
    option.value.startsWith('action-improvement-'),
  )
  if (improvement) response = session.resolveChoice(0, improvement.value)
  return response
}

const cardOption = (response: SessionResponse) => response.interaction.stateId === 'wait'
  ? response.interaction.request.options?.find((option) => option.value === CARD_ID)
  : undefined

const playMinor = (session: GameSession) => {
  const response = openMinorPrompt(session)
  if (!response.state.players[0]!.minorHand.includes(CARD_ID)) return response
  const option = cardOption(response)
  expect(option).toBeDefined()
  return session.resolveChoice(0, option!.value)
}

describe('E002 Renovation Materials session', () => {
  it('pays its card cost, renovates a wooden house to clay for free, and passes', () => {
    const session = setup({ clay: 3, reed: 1 })
    const response = playMinor(session)

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]).toMatchObject({
      houseType: 'clay',
      rooms: 2,
      resources: { clay: 0, reed: 0 },
    })
    expect(response.state.players[0]!.minorPlayed).not.toContain(CARD_ID)
    expect(response.state.players[1]!.minorHand).toContain(CARD_ID)
  })

  it('is unavailable without its printed card cost and preserves card state', () => {
    const session = setup({ clay: 2, reed: 1 })
    const response = openMinorPrompt(session)

    expect(cardOption(response)).toBeUndefined()
    expect(response.state.players[0]).toMatchObject({
      houseType: 'wood',
      resources: { clay: 2, reed: 1 },
    })
    expect(response.state.players[0]!.minorHand).toContain(CARD_ID)
    expect(response.state.players[1]!.minorHand).not.toContain(CARD_ID)
  })

  it('is unavailable outside a wooden house and preserves card state', () => {
    const session = setup({ clay: 3, reed: 1, houseType: 'clay' })
    const response = openMinorPrompt(session)

    expect(cardOption(response)).toBeUndefined()
    expect(response.state.players[0]).toMatchObject({
      houseType: 'clay',
      resources: { clay: 3, reed: 1 },
    })
    expect(response.state.players[0]!.minorHand).toContain(CARD_ID)
    expect(response.state.players[1]!.minorHand).not.toContain(CARD_ID)
  })
})

describe('ae-negative-23-renovation', () => {
  const { MATERIALS, sessions, save, ok, finish, menu, buy, make } = audit23Renovation
  afterEach(()=>sessions.splice(0).forEach(s=>s.dispose()))
  it('E002 N1 actual four wooden room purchase pays only three clay one reed and keeps real room animal assignment through free renovation',()=>{const s=make(MATERIALS,'wood',4,0,3,1,100,true);const{pending,r}=buy(s,MATERIALS);assert.equal(r.state.players[0]!.houseType,'clay');assert.equal(r.state.players[0]!.rooms,4);assert.equal(r.state.players[0]!.roomTiles.length,4);assert.equal(r.state.players[0]!.resources.clay,0);assert.equal(r.state.players[0]!.resources.reed,0);assert.deepEqual(r.state.players[0]!.houseAnimals,{'1-0':'sheep'});const undone=ok(s.undoAction());assert.equal(undone.state.players[0]!.houseType,'wood');assert.equal(undone.state.players[0]!.resources.clay,3);assert.equal(undone.state.players[0]!.resources.reed,1);assert.ok(undone.state.players[0]!.minorHand.includes(MATERIALS));const retry=buy(s,MATERIALS).r;assert.equal(retry.state.players[0]!.houseType,'clay');save('E002-N1',{pending,r,undone,retry})})
  it('E002 N2 missing each printed resource or nonwood house rejects before free alternative with no upgrade or passing',()=>{for(const mode of['clay','reed','clay-house','stone-house']){const house=mode==='clay-house'?'clay':mode==='stone-house'?'stone':'wood',s=make(MATERIALS,house,2,0,mode==='clay'?2:3,mode==='reed'?0:1),pending=menu(s),rejected=assertRejectedUnchanged(s,()=>s.resolveChoice(0,MATERIALS)),legal=finish(s,ok(s.resolveChoice(0,'B004_WoodPile')));assert.equal(legal.state.players[0]!.houseType,house);assert.ok(legal.state.players[0]!.minorHand.includes(MATERIALS));assert.ok(!legal.state.players[1]!.minorHand.includes(MATERIALS));save(`E002-N2-${mode}`,{pending,rejected,legal})}})
})
