import { describe, expect, it } from 'vitest'
import type { GameSession, SessionResponse } from '../game/authoritative-session'
import type { GameState, PlayerState } from '../../shared/contract/types'
import { setWorkersAtHome } from '../../shared/domain/player'
import { setStoredResource } from '../../shared/cards/helpers/card-storage'
import { getCardStack, readCardExtraData } from '../../shared/cards/helpers/card-state'
import { createWorkSession } from './_helpers/session-fixtures'

import '../../shared/cards/E/E103_Wolf'
import '../../shared/cards/C/C120_AgriculturalLabourer'
import '../../shared/cards/A/A102_Grocer'
import '../../shared/cards/A/A048_ShavingHorse'
import '../../shared/cards/B/B083_MuddyPuddles'
import '../../shared/cards/D/D036_BreedRegistry'
import '../../shared/cards/E/E118_KindlingGatherer'
import '../../shared/cards/E/E033_BeaverColony'

// Existing goods leaving a card reach the supply through `receive` (#1288): resource
// listeners see each movement once, and Gain-only listeners never see it.

const WOLF = 'E103_Wolf'
const LABOURER = 'C120_AgriculturalLabourer'
const GROCER = 'A102_Grocer'
const GROCER_ANYTIME = 'A102-grocer-anytime'
const PUDDLES = 'B083_MuddyPuddles'
const PUDDLES_ANYTIME = 'B83-muddy-puddles-anytime'
const FILLER = '__test_placeholder__'

const setup = (configure: (player: PlayerState, state: GameState) => void): GameSession =>
  createWorkSession({
    seed: 1288,
    configure: (state) => {
      state.currentPlayerIndex = 0
      state.actionSpaces.forEach((space) => {
        space.takenBy = []
        if (space.id === 'grain-seeds') space.resources.grain = 0
      })
      state.players.forEach((player, index) => {
        setWorkersAtHome(state, player, index === 0 ? 2 : 0)
        player.minorHand = [FILLER]
        player.occupationHand = [FILLER]
        player.minorPlayed = []
        player.occupationPlayed = []
        player.cardStates = {}
        Object.assign(player.resources, {
          wood: 0, clay: 0, reed: 0, stone: 0, food: 0, grain: 0, vegetable: 0,
          sheep: 0, boar: 0, cattle: 0, begging: 0,
        })
      })
      const owner = state.players[0]!
      owner.pastures = [{
        id: 'receive-pasture', size: 2, tiles: [{ row: 2, col: 3 }, { row: 2, col: 4 }],
        stables: 0, animalType: null, animalCount: 0,
      }]
      configure(owner, state)
    },
  })

const wait = (response: SessionResponse) => {
  expect(response.ok, response.error).toBe(true)
  expect(response.interaction.stateId).toBe('wait')
  if (response.interaction.stateId !== 'wait') throw new Error('expected a waiting interaction')
  return response.interaction
}

const requestKind = (response: SessionResponse) =>
  response.interaction.stateId === 'wait' ? response.interaction.request.kind : response.interaction.stateId

const optionFor = (response: SessionResponse, cardId: string) => {
  const option = wait(response).request.options?.find((entry) => entry.sourceCard === cardId || entry.value === cardId)
  expect(option, JSON.stringify(response.interaction)).toBeDefined()
  return option!.value
}

const optionValues = (response: SessionResponse) => wait(response).request.options?.map((entry) => entry.value) ?? []

const listsCard = (response: SessionResponse, cardId: string) =>
  response.interaction.stateId === 'wait'
  && (response.interaction.request.options ?? []).some((entry) => entry.sourceCard === cardId)

const cardGoodsMoves = (response: SessionResponse, cardId: string) =>
  response.state.events.filter((event) => event.type === 'resource.moved'
    && event.from.kind === 'card' && event.from.cardId === cardId && event.to.kind === 'player')

const wolfAndLabourer = () => setup((owner) => {
  owner.occupationPlayed = [WOLF, LABOURER]
  owner.cardStates[WOLF] = { stack: ['clay'] }
  setStoredResource(owner, LABOURER, 'clay', 8)
})

// Grain from the action space makes Agricultural Labourer take 1 clay off its card; that clay matches Wolf's top.
const reachWolfTrigger = (session: GameSession) => {
  let response = session.takeAction(0, 'grain-seeds')
  expect(requestKind(response)).toBe('select-trigger')
  response = session.resolveChoice(0, optionFor(response, LABOURER))
  expect(requestKind(response)).toBe('select-trigger')
  expect(listsCard(response, WOLF)).toBe(true)
  return response
}

describe('existing goods received from cards', () => {
  it('asks Wolf once when the player skips its claim after take-from-card', () => {
    const session = wolfAndLabourer()
    let response = session.resolveChoice(0, optionFor(reachWolfTrigger(session), WOLF))
    expect(requestKind(response)).toBe('choice')
    expect(optionValues(response)).toContain('__skip__')
    response = session.resolveChoice(0, '__skip__')

    expect(requestKind(response)).toBe('confirm-next-player')
    const player = response.state.players[0]!
    expect(player.resources).toMatchObject({ grain: 1, clay: 1, boar: 0 })
    expect(player.cardStates[WOLF]?.stack).toEqual(['clay'])
    expect(player.cardStates[LABOURER]?.counters?.clay).toBe(7)
    expect(cardGoodsMoves(response, LABOURER)).toEqual([expect.objectContaining({ resources: { clay: 1 }, reason: 'cardEffect' })])
  })

  it('does not ask Wolf again after the player passes its trigger', () => {
    const session = wolfAndLabourer()
    reachWolfTrigger(session)
    const response = session.resolveChoice(0, '__pass__')

    expect(requestKind(response)).toBe('confirm-next-player')
    const player = response.state.players[0]!
    expect(player.resources).toMatchObject({ grain: 1, clay: 1, boar: 0 })
    expect(player.cardStates[WOLF]?.stack).toEqual(['clay'])
  })

  it('lets Wolf claim its top good once when the player accepts', () => {
    const session = wolfAndLabourer()
    let response = session.resolveChoice(0, optionFor(reachWolfTrigger(session), WOLF))
    response = session.resolveChoice(0, optionValues(response).find((value) => value !== '__skip__')!)
    expect(requestKind(response)).toBe('animal-reorg')
    response = session.resolveChoice(0, 'confirm', { zones: [{
      id: 'receive-pasture', zoneType: 'pasture', animalType: 'boar', animalCount: 1,
    }] })

    expect(requestKind(response)).toBe('confirm-next-player')
    const player = response.state.players[0]!
    expect(player.resources).toMatchObject({ grain: 1, clay: 2, boar: 1 })
    expect(player.cardStates[WOLF]?.stack).toEqual([])
    // The claimed clay is received before the boar is gained.
    expect(cardGoodsMoves(response, WOLF).map((event) => event.type === 'resource.moved' && event.resources))
      .toEqual([{ clay: 1 }, { boar: 1 }])
  })
})

// Open a Grocer purchase while the farmland selection waits, then settle any trigger selection for `cardId`.
const buyFromGrocer = (session: GameSession) => {
  expect(requestKind(session.takeAction(0, 'farmland'))).toBe('farm-select')
  return session.takeAnytimeAction(0, GROCER_ANYTIME)
}

const openTrigger = (session: GameSession, response: SessionResponse, cardId: string) =>
  requestKind(response) === 'select-trigger' ? session.resolveChoice(0, optionFor(response, cardId)) : response

describe('goods popped from a card stack', () => {
  it('asks Wolf once for a matching Grocer purchase and returns to the farmland selection after a skip', () => {
    const session = setup((owner) => {
      owner.occupationPlayed = [WOLF, GROCER]
      owner.cardStates[WOLF] = { stack: ['wood'] }
      owner.cardStates[GROCER] = { stack: ['clay', 'wood'] }
      owner.resources.food = 1
    })
    let response = openTrigger(session, buyFromGrocer(session), WOLF)
    expect(requestKind(response)).toBe('choice')
    expect(listsCard(response, WOLF)).toBe(true)
    response = session.resolveChoice(0, '__skip__')

    expect(requestKind(response)).toBe('farm-select')
    const player = response.state.players[0]!
    expect(player.resources).toMatchObject({ wood: 1, food: 0, boar: 0 })
    expect(getCardStack(player, GROCER)).toEqual(['clay'])
    expect(player.cardStates[WOLF]?.stack).toEqual(['wood'])
    expect(cardGoodsMoves(response, GROCER)).toEqual([expect.objectContaining({ resources: { wood: 1 }, reason: 'cardEffect' })])
  })

  it('gives Agricultural Labourer clay for grain bought from the Grocer', () => {
    const session = setup((owner) => {
      owner.occupationPlayed = [GROCER, LABOURER]
      owner.cardStates[GROCER] = { stack: ['clay', 'grain'] }
      setStoredResource(owner, LABOURER, 'clay', 8)
      owner.resources.food = 1
    })
    const response = openTrigger(session, buyFromGrocer(session), LABOURER)

    expect(requestKind(response)).toBe('farm-select')
    const player = response.state.players[0]!
    expect(player.resources).toMatchObject({ grain: 1, clay: 1, food: 0 })
    expect(player.cardStates[LABOURER]?.counters?.clay).toBe(7)
    expect(cardGoodsMoves(response, GROCER)).toEqual([expect.objectContaining({ resources: { grain: 1 } })])
    expect(cardGoodsMoves(response, LABOURER)).toEqual([expect.objectContaining({ resources: { clay: 1 } })])
  })

  it('offers the Shaving Horse exchange when wood bought from the Grocer reaches five', () => {
    const session = setup((owner) => {
      owner.occupationPlayed = [GROCER]
      owner.minorPlayed = ['A048_ShavingHorse']
      owner.cardStates[GROCER] = { stack: ['clay', 'wood'] }
      owner.resources.food = 1
      owner.resources.wood = 4
    })
    let response = openTrigger(session, buyFromGrocer(session), 'A048_ShavingHorse')
    expect(listsCard(response, 'A048_ShavingHorse')).toBe(true)
    response = session.resolveChoice(0, optionValues(response).find((value) => value !== '__skip__')!)

    expect(requestKind(response)).toBe('farm-select')
    expect(response.state.players[0]!.resources).toMatchObject({ wood: 4, food: 3 })
  })

  it('counts a sheep taken from Muddy Puddles once for Breed Registry', () => {
    const session = setup((owner) => {
      owner.minorPlayed = [PUDDLES, 'D036_BreedRegistry']
      owner.cardStates[PUDDLES] = { stack: ['boar', 'sheep'] }
      owner.resources.clay = 1
    })
    expect(requestKind(session.takeAction(0, 'farmland'))).toBe('farm-select')
    let response = session.takeAnytimeAction(0, PUDDLES_ANYTIME)
    if (requestKind(response) === 'animal-reorg') {
      response = session.resolveChoice(0, 'confirm', { zones: [{
        id: 'receive-pasture', zoneType: 'pasture', animalType: 'sheep', animalCount: 1,
      }] })
    }

    expect(requestKind(response)).toBe('farm-select')
    const player = response.state.players[0]!
    expect(player.resources).toMatchObject({ sheep: 1, clay: 0 })
    expect(readCardExtraData<number>(player, 'D036_BreedRegistry', 'cardSheep')).toBe(1)
  })

  it('does not treat goods from a card as goods from an action space', () => {
    const session = setup((owner) => {
      owner.occupationPlayed = [GROCER, 'E118_KindlingGatherer']
      owner.minorPlayed = [PUDDLES, 'E033_BeaverColony']
      owner.cardStates[GROCER] = { stack: ['clay', 'reed'] }
      owner.cardStates[PUDDLES] = { stack: ['boar', 'food'] }
      owner.resources.food = 1
      owner.resources.clay = 1
    })
    expect(requestKind(buyFromGrocer(session))).toBe('farm-select')
    const response = session.takeAnytimeAction(0, PUDDLES_ANYTIME)

    expect(requestKind(response)).toBe('farm-select')
    const player = response.state.players[0]!
    expect(player.resources).toMatchObject({ reed: 1, food: 1, wood: 0, clay: 0 })
    expect(response.state.events.filter((event) =>
      event.sourceCardId === 'E118_KindlingGatherer' || event.sourceCardId === 'E033_BeaverColony')).toEqual([])
  })
})
