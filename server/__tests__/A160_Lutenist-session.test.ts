import { describe, expect, it, afterEach } from 'vitest'
import { GameSession, type SessionResponse } from '../game/authoritative-session'
import { setWorkersAtHome } from '../../shared/domain/player'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'
import { confirmPlayerSwitch } from './_helpers/pending-confirms'

import '../../shared/cards/A/A160_Lutenist'
import assert from 'node:assert/strict'
import { assertRejectedUnchanged } from './_helpers/negative-rule-audit'
import * as audit17Trade from './_helpers/audit/ae-negative-17-trade'

const CARD_ID = 'A160_Lutenist'
const FILLER = '__test_placeholder__'

const setup = ({ actor = 1, food = 1, played = true } = {}) => {
  const session = new GameSession(5160, undefined, { playerCount: 4 })
  stabilizeRandomHands(session.state.players)
  const state = session.getState().state
  state.currentPlayerIndex = actor
  state.round = 14
  state.roundPhase = 'work'
  state.players.forEach((player) => {
    player.minorHand = [FILLER]
    player.occupationHand = [FILLER]
    player.resources.food = 0
    player.resources.wood = 0
    player.resources.vegetable = 0
    setWorkersAtHome(state, player, 2)
  })
  const owner = state.players[0]!
  owner.occupationHand = played ? [FILLER] : [CARD_ID]
  owner.occupationPlayed = played ? [CARD_ID] : []
  owner.resources.food = food
  const travelingPlayers = state.actionSpaces.find((space) => space.id === 'traveling-players')
  if (!travelingPlayers) throw new Error('traveling-players missing')
  travelingPlayers.resources.food = 3
  travelingPlayers.takenBy = []
  session.loadState(state)
  return session
}

const playOccupation = (session: GameSession) => {
  const response = session.takeAction(0, 'lessons')
  if (!response.state.players[0]!.occupationHand.includes(CARD_ID)) return response
  if (response.interaction.stateId !== 'wait') return response
  const option = response.interaction.request.options?.find((candidate) => candidate.value === CARD_ID)
  expect(option).toBeDefined()
  return session.resolveChoice(response.interaction.playerIndex, option!.value)
}

const enterLutenistChoice = (session: GameSession, response: SessionResponse) => {
  while (response.interaction.stateId === 'wait'
    && response.interaction.request.kind === 'confirm-player-switch') {
    response = confirmPlayerSwitch(session)
  }
  return response
}

const acceptPurchase = (session: GameSession, response: SessionResponse) => {
  response = enterLutenistChoice(session, response)
  expect(response.interaction.stateId).toBe('wait')
  if (response.interaction.stateId !== 'wait') return response
  const purchase = response.interaction.request.options?.find((option) => option.value !== '__skip__')
  expect(purchase, JSON.stringify(response.interaction)).toBeDefined()
  return session.resolveChoice(response.interaction.playerIndex, purchase!.value)
}

describe('A160 Lutenist parity', () => {
  it('A160 S1: Lutenist is played as the first occupation without paying food in a four-player game', () => {
    const response = playOccupation(setup({ actor: 0, food: 0, played: false }))

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.occupationPlayed).toContain(CARD_ID)
    expect(response.state.players[0]!.resources.food).toBe(0)
  })

  it('A160 S2: after an opponent uses Traveling Players the owner gains food and wood and may buy a vegetable', () => {
    const session = setup()
    let response = session.takeAction(1, 'traveling-players')

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[1]!.resources.food).toBe(3)
    expect(response.state.players[0]!.resources).toMatchObject({ food: 2, wood: 1, vegetable: 0 })
    response = acceptPurchase(session, response)

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources).toMatchObject({ food: 0, wood: 1, vegetable: 1 })
  })

  it('A160 S3: the owner may decline the vegetable purchase after receiving the automatic reward', () => {
    const session = setup()
    let response = enterLutenistChoice(session, session.takeAction(1, 'traveling-players'))
    expect(response.interaction.stateId).toBe('wait')
    if (response.interaction.stateId === 'wait') {
      response = session.resolveChoice(response.interaction.playerIndex, '__skip__')
    }

    expect(response.state.players[0]!.resources).toMatchObject({ food: 2, wood: 1, vegetable: 0 })
  })

  it('A160 S4: with no initial food the automatic reward resolves but the vegetable purchase is unavailable', () => {
    const session = setup({ food: 0 })
    const response = enterLutenistChoice(session, session.takeAction(1, 'traveling-players'))

    expect(response.state.players[0]!.resources).toMatchObject({ food: 1, wood: 1, vegetable: 0 })
    expect(response.interaction.stateId === 'wait'
      ? (response.interaction.request.options?.some((option) => option.sourceCard === CARD_ID) ?? false)
      : false).toBe(false)
  })

  it('A160 S5: the owner using Traveling Players does not trigger Lutenist', () => {
    const response = setup({ actor: 0 }).takeAction(0, 'traveling-players')

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources).toMatchObject({ food: 4, wood: 0, vegetable: 0 })
    expect(response.interaction.stateId === 'wait'
      ? (response.interaction.request.options?.some((option) => option.sourceCard === CARD_ID) ?? false)
      : false).toBe(false)
  })

  it('A160 S6: an opponent using a non-Traveling-Players space does not trigger Lutenist', () => {
    const response = setup().takeAction(1, 'day-laborer')

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources).toMatchObject({ food: 1, wood: 0, vegetable: 0 })
    expect(response.interaction.stateId === 'wait'
      ? (response.interaction.request.options?.some((option) => option.sourceCard === CARD_ID) ?? false)
      : false).toBe(false)
  })
})

describe('ae-negative-17-trade', () => {
  const { LUTE, sessions, save, setup, turn, finish, offer, material } = audit17Trade
  afterEach(()=>sessions.splice(0).forEach(s=>s.dispose()))
  it('A160 N1 mandatory food and wood arrive before optional two food buys exactly one vegetable',()=>{const s=setup(LUTE,{food:1});turn(s,0,'grain-seeds');const pending=turn(s,1,'traveling-players');assert.equal(material(pending).food,2);assert.equal(material(pending).wood,1);const r=finish(s,pending);assert.equal(material(r).food,0);assert.equal(material(r).wood,1);assert.equal(material(r).vegetable,1);assert.equal(material(r,1).vegetable,0);save('A160-N1',{pending,r})})
  it('A160 N2 decline and zero initial food retain mandatory gain without free vegetable',()=>{for(const food of[0,2]){const s=setup(LUTE,{food});turn(s,0,'grain-seeds');const pending=turn(s,1,'traveling-players'),r=finish(s,pending,false);assert.equal(material(r).food,food+1);assert.equal(material(r).wood,1);assert.equal(material(r).vegetable,0);save(`A160-N2-${food}`,{pending,r})}})
  it('A160 N3 hand own and unrelated opponent cannot grant mandatory owner goods',()=>{for(const[played,own,space]of[[false,false,'traveling-players'],[true,true,'traveling-players'],[true,false,'fishing']]as const){const s=setup(LUTE,{},played);const r=own?turn(s,0,space):finish(s,offer(s,space));assert.equal(material(r).wood,0);assert.equal(material(r).vegetable,0);save(`A160-N3-${played}-${own}`,r)}})
  it('A160 N4 wrong actor illegal and stale purchase cannot spend or produce twice',()=>{const s=setup(LUTE,{food:3});turn(s,0,'grain-seeds');const pending=turn(s,1,'traveling-players');assertRejectedUnchanged(s,()=>s.resolveChoice(1,'buy'));assertRejectedUnchanged(s,()=>s.resolveChoice(0,'buy-two'));const r=finish(s,pending);assert.equal(material(r).food,2);assert.equal(material(r).vegetable,1);assertRejectedUnchanged(s,()=>s.resolveChoice(0,'buy'));save('A160-N4',r)})
})
