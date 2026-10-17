import { describe, expect, it, afterEach } from 'vitest'
import { GameSession, type SessionResponse } from '../game/authoritative-session'
import { setWorkersAtHome } from '../../shared/domain/player'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'
import '../../shared/cards/E/E163_Patroness'
import '../../shared/cards/A/A123_FrameBuilder'
import assert from 'node:assert/strict'
import * as audit57Resources from './_helpers/audit/ae-negative-57-resources'

const CARD_ID = 'E163_Patroness'

const OTHER_OCCUPATION = 'A123_FrameBuilder'

const FILLER = '__test_placeholder__'

const BUILDING_RESOURCES = ['wood', 'clay', 'reed', 'stone'] as const

type BuildingResource = typeof BUILDING_RESOURCES[number]

const setup = ({ played = true, actorIndex = 0 } = {}) => {
  const session = new GameSession(6163, undefined, { playerCount: 4 })
  stabilizeRandomHands(session.state.players)
  const state = session.getState().state
  state.currentPlayerIndex = actorIndex
  state.round = 5
  state.roundPhase = 'work'
  state.availableMajorImprovements = []
  state.actionSpaces.forEach((space) => { space.takenBy = [] })
  state.players.forEach((player, index) => {
    setWorkersAtHome(state, player, index === actorIndex ? 2 : 0)
    player.minorHand = [FILLER]
    player.occupationHand = [FILLER]
    player.minorPlayed = []
    player.occupationPlayed = []
    player.cardStates = {}
    Object.assign(player.resources, {
      wood: 0, clay: 0, reed: 0, stone: 0, food: index === actorIndex ? 1 : 20,
      grain: 0, vegetable: 0, sheep: 0, boar: 0, cattle: 0, begging: 0,
    })
  })
  const owner = state.players[0]!
  owner.occupationHand = played ? [FILLER] : [CARD_ID]
  owner.occupationPlayed = played ? [CARD_ID] : []
  if (played) state.players[actorIndex]!.occupationHand = [OTHER_OCCUPATION]
  session.loadState(state)
  return session
}

const optionsOf = (response: SessionResponse) => response.interaction.stateId === 'wait'
  ? response.interaction.request.options ?? []
  : []

const playOccupation = (session: GameSession, actorIndex: number, cardId: string) => {
  let response = session.takeAction(actorIndex, 'lessons')
  expect(response.ok, response.error).toBe(true)
  if (response.interaction.stateId === 'wait'
    && response.state.players[actorIndex]!.occupationHand.includes(cardId)) {
    const card = optionsOf(response).find((option) => option.value === cardId)
    expect(card, JSON.stringify(response.interaction, null, 2)).toBeDefined()
    response = session.resolveChoice(response.interaction.playerIndex, card!.value)
  }
  return response
}

const enterPatronessChoice = (session: GameSession, initial: SessionResponse) => {
  let response = initial
  for (let step = 0; step < 3 && response.interaction.stateId === 'wait'; step += 1) {
    if (BUILDING_RESOURCES.some((resource) => optionsOf(response).some((option) =>
      option.effectPreview?.resourcesGained?.[resource] === 1))) return response
    const trigger = optionsOf(response).find((option) =>
      option.value === CARD_ID || option.sourceCard === CARD_ID)
    if (!trigger) break
    response = session.resolveChoice(response.interaction.playerIndex, trigger.value)
  }
  return response
}

const choosePatronessResource = (
  session: GameSession, initial: SessionResponse, resource: BuildingResource,
) => {
  const response = enterPatronessChoice(session, initial)
  expect(response.interaction.stateId).toBe('wait')
  expect(optionsOf(response).some((option) =>
    option.value === '__skip__' || option.value === '__pass__')).toBe(false)
  const choice = optionsOf(response).find((option) =>
    option.effectPreview?.resourcesGained?.[resource] === 1)
  expect(choice, JSON.stringify(response.interaction, null, 2)).toBeDefined()
  return session.resolveChoice(response.interaction.playerIndex, choice!.value)
}

describe('E163 Patroness parity', () => {
  it('E163 S1: playing Patroness itself grants no building resource', () => {
    const response = playOccupation(setup({ played: false }), 0, CARD_ID)

    expect(response.state.players[0]!.occupationPlayed).toContain(CARD_ID)
    expect(response.state.players[0]!.resources).toMatchObject({
      wood: 0, clay: 0, reed: 0, stone: 0,
    })
  })

  it.each(BUILDING_RESOURCES)(
    'E163 S2: after a later occupation exactly one chosen %s is gained',
    (resource) => {
      const session = setup()
      let response = playOccupation(session, 0, OTHER_OCCUPATION)
      response = choosePatronessResource(session, response, resource)

      expect(response.state.players[0]!.occupationPlayed).toContain(OTHER_OCCUPATION)
      expect(response.state.players[0]!.resources.food).toBe(0)
      for (const type of BUILDING_RESOURCES) {
        expect(response.state.players[0]!.resources[type]).toBe(type === resource ? 1 : 0)
      }
    },
  )

  it('E163 S3: an opponent playing an occupation does not trigger Patroness', () => {
    const response = playOccupation(setup({ actorIndex: 1 }), 1, OTHER_OCCUPATION)

    expect(response.state.players[1]!.occupationPlayed).toContain(OTHER_OCCUPATION)
    expect(optionsOf(response).some((option) => option.sourceCard === CARD_ID)).toBe(false)
    expect(response.state.players[0]!.resources).toMatchObject({
      wood: 0, clay: 0, reed: 0, stone: 0,
    })
  })
})

describe('ae-negative-57-resources', () => {
  const { sessions, ok, gainOf, save, make, finish, play, choose, buildings } = audit57Resources
  afterEach(() => sessions.splice(0).forEach(session => session.dispose()))
  it('E163 N1 actual Patroness purchase grants no resource and a later paid occupation grants exactly one chosen building resource', () => {
    for (const resource of ['wood', 'clay', 'reed', 'stone'] as const) {
      const first = make('E163_Patroness', undefined, false), played = finish(first, play(first, 'E163_Patroness'))
      assert.deepEqual(buildings(played), { wood: 0, clay: 0, reed: 0, stone: 0 })
      const session = make('E163_Patroness', state => { state.players[0]!.occupationHand = ['A110_Roughcaster', 'A125_Priest'] }), pending = play(session, 'A110_Roughcaster'), response = finish(session, choose(session, pending, option => gainOf(option)?.[resource] === 1))
      assert.deepEqual(buildings(response), { wood: resource === 'wood' ? 1 : 0, clay: resource === 'clay' ? 1 : 0, reed: resource === 'reed' ? 1 : 0, stone: resource === 'stone' ? 1 : 0 })
      assert.equal(response.state.players[0]!.resources.food, 99)
      save(`E163-N1-${resource}`, { played, pending, response })
    }
  })
  it('E163 N2 opponent occupation unrelated grain collection and card only in hand cannot grant owner building resources', () => {
    for (const mode of ['opponent', 'unrelated', 'hand']) {
      const session = make('E163_Patroness', state => { if (mode === 'opponent') { state.currentPlayerIndex = 1; state.players[1]!.occupationHand = ['A110_Roughcaster'] } }, mode !== 'hand')
      if (mode === 'hand') assert.ok(session.getState().state.players[0]!.occupationHand.includes('E163_Patroness'))
      const response = mode === 'opponent' ? finish(session, ok(session.takeAction(1, 'lessons')), true) : mode === 'hand' ? finish(session, play(session, 'A110_Roughcaster'), true) : finish(session, ok(session.takeAction(0, 'grain-seeds')), true)
      assert.deepEqual(buildings(response), { wood: 0, clay: 0, reed: 0, stone: 0 })
      save(`E163-N2-${mode}`, response)
    }
  })
})
