import { describe, expect, it, afterEach } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { setWorkersAtHome } from '../../shared/domain/player'
import '../../shared/cards/D/D083_Pigswill'
import assert from 'node:assert/strict'
import { assertRejectedUnchanged } from './_helpers/negative-rule-audit'
import * as audit43Renovation from './_helpers/audit/ae-negative-43-renovation'

const CARD_ID = 'D083_Pigswill'

const setup = (opts?: { food?: number; grain?: number }) => {
  const session = new GameSession(/* seed */ 1)
  const state = session.getState().state
  state.players = state.players.slice(0, 2)
  state.currentPlayerIndex = 0
  state.round = 5
  state.roundPhase = 'work'

  const player = state.players[0]!
  setWorkersAtHome(state, player, 2)
  player.resources = {
    ...player.resources,
    food: opts?.food ?? 2,
    grain: opts?.grain ?? 0,
  }
  player.minorHand = [CARD_ID]
  player.occupationHand = ['__test_placeholder__']
  const opponent = state.players[1]!
  opponent.minorHand = ['__test_placeholder__']
  opponent.occupationHand = ['__test_placeholder__']
  opponent.workersAvailable = 2

  const majorImprovement = state.actionSpaces.find((space) => space.id === 'major-improvement')
  if (!majorImprovement) throw new Error('major-improvement missing')
  majorImprovement.takenBy = []

  session.loadState(state)
  return session
}

const enterImprovementChoice = (session: GameSession) => {
  let resp = session.takeAction(0, 'major-improvement')
  expect(resp.ok).toBe(true)
  if (resp.interaction.stateId !== 'wait') return resp
  const improvementOption = resp.interaction.request.options?.find((o) => o.value.startsWith('action-improvement-'))
  if (improvementOption) {
    resp = session.resolveChoice(0, improvementOption.value)
    expect(resp.ok).toBe(true)
  }
  return resp
}

const playD83 = (session: GameSession) => {
  const resp = enterImprovementChoice(session)
  if (resp.state.players[0]!.minorPlayed.includes(CARD_ID)) return resp
  if (resp.interaction.stateId !== 'wait') return resp
  if (resp.interaction.promptKey === 'prompt.selectPayment') return resp
  const d83Option = resp.interaction.request.options?.find((o) => o.value === CARD_ID)
  expect(d83Option).toBeDefined()
  return session.resolveChoice(0, d83Option!.value)
}

describe('D083_Pigswill session — altCosts', () => {
  it('D083 S1: food=2 and grain=0 auto-pays food', () => {
    const session = setup({ food: 2, grain: 0 })
    const resp = playD83(session)
    expect(resp.interaction.stateId === 'wait' ? resp.interaction.request.kind : resp.interaction.stateId).toBe('confirm-next-player')
    expect(resp.state.players[0]!.resources.food).toBe(0)
  })

  it('D083 S2: food=0 and grain=1 auto-pays grain', () => {
    const session = setup({ food: 0, grain: 1 })
    const resp = playD83(session)
    expect(resp.interaction.stateId === 'wait' ? resp.interaction.request.kind : resp.interaction.stateId).toBe('confirm-next-player')
    expect(resp.state.players[0]!.resources.grain).toBe(0)
  })

  it('D083 supplemental: both costs available require a payment choice', () => {
    const session = setup({ food: 2, grain: 1 })
    const resp = playD83(session)
    expect(resp.interaction.stateId).toBe('wait')
    if (resp.interaction.stateId !== 'wait') return
    expect(resp.interaction.promptKey).toBe('prompt.selectPayment')
    expect(resp.interaction.request.options?.length).toBeGreaterThanOrEqual(2)
  })

  it('D083 supplemental: neither complete cost keeps Pigswill unavailable', () => {
    const session = setup({ food: 1, grain: 0 })
    expect(session.getActionAvailability(0)['major-improvement']).toBe(false)
    const resp = session.takeAction(0, 'major-improvement')
    expect(resp.ok).toBe(false)
    expect(resp.state.players[0]!.minorHand).toContain(CARD_ID)
  })
})

const setupTrigger = () => {
  const session = setup({ food: 0, grain: 0 })
  const state = session.getState().state
  const player = state.players[0]!
  player.minorHand = ['__test_placeholder__']
  player.minorPlayed = [CARD_ID]
  player.resources.wood = 4
  player.resources.boar = 0
  session.loadState(state)
  return session
}

const houseBonusBoar = (session: GameSession) => {
  const response = session.getState()
  expect(response.interaction.stateId === 'wait' && response.interaction.request.kind).toBe('animal-reorg')
  expect(response.state.players[0]!.resources.boar).toBe(1)
  expect(response.state.players[0]!.fenceSegments).toHaveLength(0)
  expect(response.state.players[0]!.resources.wood).toBe(4)
  const housed = session.resolveChoice(0, 'confirm', {
    zones: [{ id: 'house:2-0', zoneType: 'house', animalType: 'boar', animalCount: 1 }],
  })
  expect(housed.ok, housed.error).toBe(true)
  expect(housed.interaction.stateId === 'wait' && housed.interaction.request.kind).toBe('farm-select')
  return housed
}

describe('D083 Pigswill parity trigger', () => {
  it('D083 S3: using Fencing gains one boar before completing a one-space pasture', () => {
    const session = setupTrigger()
    const selection = session.takeAction(0, 'fencing')
    expect(selection.ok, selection.error).toBe(true)
    houseBonusBoar(session)

    const response = session.commitSelectionChoice(0, {
      edges: ['H-0-0', 'H-1-0', 'V-0-0', 'V-0-1'],
    })

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources.boar).toBe(1)
    expect(response.state.players[0]!.pastures).toHaveLength(1)
    expect(response.state.players[0]!.resources.wood).toBe(0)
  })

  it('D083 S4: an unrelated action grants no boar', () => {
    const response = setupTrigger().takeAction(0, 'day-laborer')

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources.boar).toBe(0)
  })
})

describe('ae-negative-43-renovation', () => {
  const { SWILL, sessions, save, ok, make, choose, menu, purchase, renovation } = audit43Renovation
  afterEach(()=>sessions.splice(0).forEach(s=>s.dispose()))
  it('D083 N1 two food or one grain purchase pays only selected complete fee and incomplete fee refuses',()=>{for(const grain of[0,1]){const s=make(SWILL,false,state=>Object.assign(state.players[0]!.resources,{food:grain?0:2,grain})),a=purchase(s,SWILL);assert.equal(a.r.state.players[0]!.resources.food,0);assert.equal(a.r.state.players[0]!.resources.grain,0);save(`D083-N1-${grain}`,a)}const t=make(SWILL,false,state=>state.players[0]!.resources.food=1),pending=menu(t),bad=assertRejectedUnchanged(t,()=>t.resolveChoice(0,SWILL)),legal=ok(t.resolveChoice(0,'B004_WoodPile'));assert.equal(legal.state.players[0]!.resources.food,1);save('D083-N1-poor',{pending,bad,legal})})
  it('D083 N2 Fencing grants one boar before real four fences and unrelated action grants none',()=>{const s=make(SWILL,true,state=>state.players[0]!.resources.wood=4),pending=ok(s.takeAction(0,'fencing'));assert.equal(pending.state.players[0]!.resources.boar,1);houseBonusBoar(s);const built=ok(s.commitSelectionChoice(0,{edges:['H-0-0','H-1-0','V-0-0','V-0-1']}));assert.equal(built.state.players[0]!.resources.boar,1);assert.equal(built.state.players[0]!.fenceSegments.length,4);assert.equal(built.state.players[0]!.resources.wood,0);const t=make(SWILL),other=ok(t.takeAction(0,'day-laborer'));assert.equal(other.state.players[0]!.resources.boar,0);save('D083-N2',{pending,built,other})})
  it('D083 N3 Farm Redevelopment builds fences after renovation without granting the Fencing space boar',()=>{const s=make(SWILL,true,state=>{state.players[0]!.houseType='clay';Object.assign(state.players[0]!.resources,{stone:2,reed:1,wood:4})});let pending=renovation(s,'farm-redevelopment');if(pending.interaction.stateId==='wait'&&pending.interaction.request.kind==='choice')pending=choose(s,pending,o=>o.labelKey==='actions.fencing.name');const r=ok(s.commitSelectionChoice(0,{edges:['H-0-0','H-1-0','V-0-0','V-0-1']}));assert.equal(r.state.players[0]!.resources.boar,0);assert.equal(r.state.players[0]!.fenceSegments.length,4);assert.equal(r.state.players[0]!.resources.wood,0);save('D083-N3',{pending,r})})
})
