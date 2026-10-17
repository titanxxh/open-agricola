import { describe, expect, it, afterEach } from 'vitest'
import { GameSession, type SessionResponse } from '../game/authoritative-session'
import { setWorkersAtHome } from '../../shared/domain/player'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'

import '../../shared/cards/D/D002_DwellingPlan'
import assert from 'node:assert/strict'
import { assertRejectedUnchanged } from './_helpers/negative-rule-audit'
import * as audit23Renovation from './_helpers/audit/ae-negative-23-renovation'

const CARD_ID = 'D002_DwellingPlan'
const FILLER = '__test_placeholder__'

const setup = ({
  food = 1, clay = 2, reed = 1,
}: {
  food?: number
  clay?: number
  reed?: number
} = {}) => {
  const session = new GameSession(2002, undefined, { playerCount: 2 })
  stabilizeRandomHands(session.state.players)
  const state = session.getState().state
  state.currentPlayerIndex = 0
  state.round = 5
  state.roundPhase = 'work'
  state.players.forEach((player) => {
    setWorkersAtHome(state, player, 2)
    player.minorHand = [FILLER]
    player.occupationHand = [FILLER]
    player.minorPlayed = []
    player.occupationPlayed = []
    player.improvements = []
    player.cardStates = {}
    player.resources = {
      ...player.resources,
      wood: 0, clay: 0, reed: 0, stone: 0, food: 0, grain: 0, vegetable: 0,
      sheep: 0, boar: 0, cattle: 0, begging: 0,
    }
  })
  const player = state.players[0]!
  player.minorHand = [CARD_ID, FILLER]
  player.houseType = 'wood'
  player.rooms = 2
  player.resources = { ...player.resources, food, clay, reed }
  state.actionSpaces.find((space) => space.id === 'meeting-place')!.takenBy = []
  state.availableMajorImprovements = []
  session.loadState(state)
  return session
}

const options = (response: SessionResponse) => response.interaction.stateId === 'wait'
  ? response.interaction.request.options ?? []
  : []

const enterMinorChoice = (session: GameSession) => {
  let response = session.takeAction(0, 'meeting-place')
  if (response.interaction.stateId !== 'wait') return response
  const improvement = options(response).find((option) => option.value.startsWith('action-improvement-'))
  if (improvement) response = session.resolveChoice(response.interaction.playerIndex, improvement.value)
  return response
}

const playDwellingPlan = (session: GameSession) => {
  let response = enterMinorChoice(session)
  if (response.interaction.stateId !== 'wait') return response
  const card = options(response).find((option) => option.value === CARD_ID)
  if (card) response = session.resolveChoice(response.interaction.playerIndex, card.value)
  return response
}

const acceptRenovation = (session: GameSession, response: SessionResponse) => {
  expect(response.interaction.stateId).toBe('wait')
  if (response.interaction.stateId !== 'wait') return response
  const accept = options(response).find((option) => option.value !== '__skip__')
  expect(accept).toBeDefined()
  response = session.resolveChoice(response.interaction.playerIndex, accept!.value)
  if (response.interaction.stateId === 'wait'
    && response.interaction.promptKey === 'ui.interactionChooseRenovationTarget') {
    response = session.resolveChoice(response.interaction.playerIndex, 'clay')
  }
  return response
}

describe('D002 Dwelling Plan parity', () => {
  it('D002 S1: paying one food passes Dwelling Plan and accepting its option renovates normally', () => {
    const session = setup()
    const response = acceptRenovation(session, playDwellingPlan(session))

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.minorHand).not.toContain(CARD_ID)
    expect(response.state.players[0]!.minorPlayed).not.toContain(CARD_ID)
    expect(response.state.players[1]!.minorHand).toContain(CARD_ID)
    expect(response.state.players[0]).toMatchObject({
      houseType: 'clay',
      resources: { food: 0, clay: 0, reed: 0 },
    })
  })

  it('D002 S2: declining the optional renovation still pays and passes Dwelling Plan', () => {
    const session = setup()
    let response = playDwellingPlan(session)
    expect(response.interaction.stateId).toBe('wait')
    if (response.interaction.stateId === 'wait') {
      expect(options(response).map((option) => option.value)).toContain('__skip__')
      response = session.resolveChoice(response.interaction.playerIndex, '__skip__')
    }

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.minorHand).not.toContain(CARD_ID)
    expect(response.state.players[0]!.minorPlayed).not.toContain(CARD_ID)
    expect(response.state.players[1]!.minorHand).toContain(CARD_ID)
    expect(response.state.players[0]).toMatchObject({
      houseType: 'wood',
      resources: { food: 0, clay: 2, reed: 1 },
    })
  })

  it('D002 S3: an unaffordable optional renovation does not block the completed purchase and pass', () => {
    const session = setup({ clay: 0, reed: 0 })
    let response = playDwellingPlan(session)
    if (response.interaction.stateId === 'wait') {
      const renovationOptions = options(response)
      expect(renovationOptions.filter((option) => option.value !== '__skip__')).toHaveLength(0)
      const skip = renovationOptions.find((option) => option.value === '__skip__')
      if (skip) response = session.resolveChoice(response.interaction.playerIndex, skip.value)
    }

    expect(response.ok, response.error).toBe(true)
    if (response.interaction.stateId === 'wait') {
      expect(response.interaction.promptKey).toBe('ui.confirmNextPlayer')
    }
    expect(response.state.players[0]!.minorHand).not.toContain(CARD_ID)
    expect(response.state.players[0]!.minorPlayed).not.toContain(CARD_ID)
    expect(response.state.players[1]!.minorHand).toContain(CARD_ID)
    expect(response.state.players[0]).toMatchObject({
      houseType: 'wood',
      resources: { food: 0, clay: 0, reed: 0 },
    })
  })

  it('D002 S4: without one food Dwelling Plan is unavailable and neither passes nor renovates', () => {
    const session = setup({ food: 0 })
    const response = enterMinorChoice(session)

    expect(response.ok, response.error).toBe(true)
    expect(options(response).some((option) => option.value === CARD_ID)).toBe(false)
    expect(response.state.players[0]!.minorHand).toContain(CARD_ID)
    expect(response.state.players[1]!.minorHand).not.toContain(CARD_ID)
    expect(response.state.players[0]).toMatchObject({
      houseType: 'wood',
      resources: { food: 0, clay: 2, reed: 1 },
    })
  })
})

describe('ae-negative-23-renovation', () => {
  const { DWELLING, sessions, save, ok, finish, menu, buy, make } = audit23Renovation
  afterEach(()=>sessions.splice(0).forEach(s=>s.dispose()))
  it('D002 N1 actual one food passing purchase optional renovation pays normal two clay one reed and whole undo restores it',()=>{const s=make(DWELLING,'wood',2,0,2,1),{pending,r}=buy(s,DWELLING);assert.equal(r.state.players[0]!.houseType,'clay');assert.deepEqual(['food','clay','reed'].map(t=>r.state.players[0]!.resources[t as 'food'|'clay'|'reed']),[99,0,0]);assert.equal(r.state.players[0]!.rooms,2);assert.equal(r.state.players[0]!.fenceSegments.length,0);const undone=ok(s.undoAction());assert.equal(undone.state.players[0]!.houseType,'wood');assert.deepEqual(['food','clay','reed'].map(t=>undone.state.players[0]!.resources[t as 'food'|'clay'|'reed']),[100,2,1]);const retry=buy(s,DWELLING).r;assert.equal(retry.state.players[0]!.houseType,'clay');save('D002-N1',{pending,r,undone,retry})})
  it('D002 N2 declining renovation still pays card food and passes while missing renovation resources and stone house create no free upgrade',()=>{for(const mode of['decline','clay','reed','stone']){const s=make(DWELLING,mode==='stone'?'stone':'wood',2,0,mode==='clay'?1:2,mode==='reed'?0:1),pending=menu(s),chosen=ok(s.resolveChoice(0,DWELLING)),r=finish(s,chosen,false);assert.equal(r.state.players[0]!.houseType,mode==='stone'?'stone':'wood');assert.equal(r.state.players[0]!.resources.food,99);assert.equal(r.state.players[0]!.resources.clay,mode==='clay'?1:2);assert.equal(r.state.players[0]!.resources.reed,mode==='reed'?0:1);assert.ok(r.state.players[1]!.minorHand.includes(DWELLING));save(`D002-N2-${mode}`,{pending,chosen,r})}})
  it('D002 N3 zero card food rejects purchase before a real free alternative and cannot renovate',()=>{const s=make(DWELLING,'wood',2,0,2,1,0),pending=menu(s),rejected=assertRejectedUnchanged(s,()=>s.resolveChoice(0,DWELLING)),legal=finish(s,ok(s.resolveChoice(0,'B004_WoodPile')));assert.equal(legal.state.players[0]!.houseType,'wood');assert.equal(legal.state.players[0]!.resources.clay,2);save('D002-N3',{pending,rejected,legal})})
})
