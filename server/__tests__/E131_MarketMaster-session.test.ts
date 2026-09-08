import { describe, expect, it } from 'vitest'
import { GameSession, type SessionResponse } from '../game/authoritative-session'
import { setActiveWorkerCount } from '../../shared/domain/player'
import { findTravelingPlayersSpace } from '../../shared/cards/helpers/action-space-categories'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'

import '../../shared/cards/E/E131_MarketMaster'

const CARD_ID = 'E131_MarketMaster'
const TARGET_ID = 'A100_Curator'
const EXTRA_OCCUPATIONS = ['A106_SlurrySpreader', 'A167_BreederBuyer']
const FILLER = '__test_placeholder__'

const setup = ({
  played = true,
  food = 1,
  travelingFood = 2,
  lastWorker = true,
  extraOccupations = 0,
} = {}) => {
  const session = new GameSession(7131, undefined, { playerCount: 4 })
  stabilizeRandomHands(session.state.players)
  const state = session.getState().state
  state.currentPlayerIndex = 0
  state.round = 14
  state.roundPhase = 'work'
  state.availableMajorImprovements = []
  state.actionSpaces.forEach((space) => { space.takenBy = [] })
  state.players.forEach((player) => {
    player.minorHand = [FILLER]
    player.occupationHand = [FILLER]
    player.minorPlayed = []
    player.occupationPlayed = []
    player.improvements = []
    player.cardStates = {}
    Object.assign(player.resources, {
      wood: 0, clay: 0, reed: 0, stone: 0, food: 0, grain: 0, vegetable: 0,
      sheep: 0, boar: 0, cattle: 0, begging: 0,
    })
    setActiveWorkerCount(player, 2)
  })

  const owner = state.players[0]!
  owner.occupationHand = played ? [TARGET_ID] : [CARD_ID]
  owner.occupationPlayed = played
    ? [CARD_ID, ...EXTRA_OCCUPATIONS.slice(0, extraOccupations)]
    : []
  owner.resources.food = food

  if (lastWorker) {
    const worker = owner.workers.find((candidate) => candidate.isActive)
    const farmland = state.actionSpaces.find((candidate) => candidate.id === 'farmland')
    if (!worker || !farmland) throw new Error('cannot park the first Market Master worker')
    farmland.takenBy.push({ playerId: owner.id, workerId: worker.id })
  }

  const travelingPlayers = findTravelingPlayersSpace(state.actionSpaces)
  if (!travelingPlayers) throw new Error('traveling-players space missing')
  travelingPlayers.resources = { ...(travelingPlayers.resources ?? {}), food: travelingFood }
  session.loadState(state)
  return session
}

const optionsOf = (response: SessionResponse) => response.interaction.stateId === 'wait'
  ? response.interaction.request.options ?? []
  : []

const offersMarketMaster = (response: SessionResponse) => {
  if (response.interaction.stateId !== 'wait') return false
  if (response.interaction.sourceCard === CARD_ID) return true
  return optionsOf(response).some((option) =>
    option.sourceCard === CARD_ID || option.value === CARD_ID,
  )
}

const enterMarketMaster = (session: GameSession, response: SessionResponse) => {
  if (response.interaction.stateId !== 'wait'
    || response.interaction.request.kind !== 'select-trigger') return response
  const option = optionsOf(response).find((candidate) =>
    candidate.sourceCard === CARD_ID || candidate.value === CARD_ID,
  )
  expect(option, JSON.stringify(response.interaction, null, 2)).toBeDefined()
  return session.resolveChoice(response.interaction.playerIndex, option!.value)
}

const acceptMarketMaster = (session: GameSession, initial: SessionResponse) => {
  let response = enterMarketMaster(session, initial)
  expect(response.interaction.stateId).toBe('wait')
  if (response.interaction.stateId !== 'wait') throw new Error('expected Market Master occupation choice')
  if (response.interaction.sourceCard === CARD_ID) {
    const accept = optionsOf(response).find((candidate) => candidate.value !== '__skip__')
    expect(accept, JSON.stringify(response.interaction, null, 2)).toBeDefined()
    response = session.resolveChoice(response.interaction.playerIndex, accept!.value)
  }
  if (response.state.players[0]!.occupationPlayed.includes(TARGET_ID)
    || !response.state.players[0]!.occupationHand.includes(TARGET_ID)) return response
  if (response.interaction.stateId === 'wait'
    && response.interaction.request.kind === 'confirm-next-player') return response
  expect(response.interaction.stateId).toBe('wait')
  if (response.interaction.stateId !== 'wait') throw new Error('expected Market Master occupation selection')
  const option = optionsOf(response).find((candidate) => candidate.value === TARGET_ID)
  expect(option, JSON.stringify(response.interaction, null, 2)).toBeDefined()
  return session.resolveChoice(response.interaction.playerIndex, option!.value)
}

const declineMarketMaster = (session: GameSession, initial: SessionResponse) => {
  const response = enterMarketMaster(session, initial)
  expect(response.interaction.stateId).toBe('wait')
  if (response.interaction.stateId !== 'wait') throw new Error('expected Market Master optional choice')
  const option = optionsOf(response).find((candidate) => candidate.value === '__skip__')
  expect(option, JSON.stringify(response.interaction, null, 2)).toBeDefined()
  return session.resolveChoice(response.interaction.playerIndex, option!.value)
}

const playMarketMaster = (session: GameSession) => {
  const response = session.takeAction(0, 'lessons')
  expect(response.ok, response.error).toBe(true)
  if (response.interaction.stateId !== 'wait') return response
  const option = optionsOf(response).find((candidate) => candidate.value === CARD_ID)
  return option ? session.resolveChoice(response.interaction.playerIndex, option.value) : response
}

describe('E131 Market Master parity', () => {
  it('E131 S1: Market Master can be played as the first occupation in a four-player game', () => {
    const response = playMarketMaster(setup({ played: false, food: 0, lastWorker: false }))

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.occupationPlayed).toContain(CARD_ID)
    expect(response.state.players[0]!.resources.food).toBe(0)
  })

  it('E131 S2: placing the last person on Traveling Players offers and plays one occupation for one food', () => {
    const session = setup()

    const offered = session.takeAction(0, 'traveling-players')
    expect(offersMarketMaster(offered)).toBe(true)
    const response = acceptMarketMaster(session, offered)

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.occupationPlayed).toContain(TARGET_ID)
    expect(response.state.players[0]!.resources.food).toBe(2)
  })

  it('E131 S3: the last-person Traveling Players occupation offer can be declined', () => {
    const session = setup()

    const offered = session.takeAction(0, 'traveling-players')
    expect(offersMarketMaster(offered)).toBe(true)
    const response = declineMarketMaster(session, offered)

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.occupationHand).toContain(TARGET_ID)
    expect(response.state.players[0]!.occupationPlayed).not.toContain(TARGET_ID)
    expect(response.state.players[0]!.resources.food).toBe(3)
  })

  it('E131 S4: Traveling Players does not trigger Market Master while another person remains at home', () => {
    const response = setup({ lastWorker: false }).takeAction(0, 'traveling-players')

    expect(response.ok, response.error).toBe(true)
    expect(offersMarketMaster(response)).toBe(false)
    expect(response.state.players[0]!.occupationHand).toContain(TARGET_ID)
    expect(response.state.players[0]!.resources.food).toBe(3)
  })

  it('E131 S5: placing the last person on another action space does not trigger Market Master', () => {
    const response = setup().takeAction(0, 'forest')

    expect(response.ok, response.error).toBe(true)
    expect(offersMarketMaster(response)).toBe(false)
    expect(response.state.players[0]!.occupationHand).toContain(TARGET_ID)
  })

  it('E131 S6: without one food after collecting Traveling Players the trigger cannot play an occupation', () => {
    const session = setup({ food: 0, travelingFood: 0 })
    const offered = session.takeAction(0, 'traveling-players')

    expect(offered.ok, offered.error).toBe(true)
    expect(offersMarketMaster(offered)).toBe(false)
    expect(offered.state.players[0]!.occupationHand).toContain(TARGET_ID)
    expect(offered.state.players[0]!.resources.food).toBe(0)
  })

  it('E131 S7: the Market Master occupation costs exactly one food even after three occupations', () => {
    const session = setup({ extraOccupations: 2 })

    const offered = session.takeAction(0, 'traveling-players')
    expect(offersMarketMaster(offered)).toBe(true)
    const response = acceptMarketMaster(session, offered)

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.occupationPlayed).toContain(TARGET_ID)
    expect(response.state.players[0]!.resources.food).toBe(2)
  })
})
