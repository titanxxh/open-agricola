import { describe, expect, it } from 'vitest'
import { GameSession, type SessionResponse } from '../game/authoritative-session'
import { setWorkersAtHome } from '../../shared/domain/player'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'

import '../../shared/cards/C/C013_WoodSlideHammer'
import '../../shared/cards/A/A087_Conservator'
import '../../shared/cards/A/A110_Roughcaster'

const CARD_ID = 'C013_WoodSlideHammer'
const FILLER = '__test_placeholder__'

const options = (response: SessionResponse) => response.interaction.stateId === 'wait'
  ? response.interaction.request.options ?? []
  : []

const setup = () => {
  const session = new GameSession(6013, undefined, { playerCount: 2 })
  stabilizeRandomHands(session.state.players)
  const state = session.getState().state
  state.currentPlayerIndex = 0
  state.round = 14
  state.roundPhase = 'work'
  state.availableMajorImprovements = []
  state.actionSpaces.forEach((space) => { space.takenBy = [] })
  state.players.forEach((player, index) => {
    setWorkersAtHome(state, player, index === 0 ? 2 : 0)
    player.minorHand = [FILLER]
    player.occupationHand = [FILLER]
    player.minorPlayed = []
    player.occupationPlayed = []
    player.improvements = []
    player.activeModifiers = []
    Object.assign(player.resources, {
      wood: 0, clay: 0, reed: 0, stone: 0, food: 0, grain: 0, vegetable: 0,
      sheep: 0, boar: 0, cattle: 0, begging: 0,
    })
  })
  state.players[0]!.minorHand = [CARD_ID, FILLER]
  state.players[0]!.resources.wood = 1
  session.loadState(state)
  return session
}

const playCard = (session: GameSession) => {
  let response = session.takeAction(0, 'meeting-place')
  if (response.interaction.stateId !== 'wait') return response
  if (!options(response).some((option) =>
    option.value === CARD_ID || option.value === `minor:${CARD_ID}`)) {
    const improvement = options(response).find((option) =>
      option.value.startsWith('action-improvement-'))
    if (improvement) response = session.resolveChoice(response.interaction.playerIndex, improvement.value)
  }
  if (!response.state.players[0]!.minorHand.includes(CARD_ID)) return response
  if (response.interaction.stateId !== 'wait') return response
  const card = options(response).find((option) =>
    option.value === CARD_ID || option.value === `minor:${CARD_ID}`)
  expect(card, JSON.stringify(response.interaction)).toBeDefined()
  return session.resolveChoice(response.interaction.playerIndex, card!.value)
}

const buyThenPrepare = ({
  rooms, houseType = 'wood', resources,
}: {
  rooms: number
  houseType?: 'wood' | 'clay'
  resources: Partial<Record<'clay' | 'stone' | 'reed', number>>
}) => {
  const session = setup()
  const bought = playCard(session)
  expect(bought.ok, bought.error).toBe(true)
  expect(bought.state.players[0]!.minorPlayed).toContain(CARD_ID)

  const state = session.getState().state
  state.currentPlayerIndex = 0
  state.roundPhase = 'work'
  state.actionSpaces.forEach((space) => { space.takenBy = [] })
  setWorkersAtHome(state, state.players[0]!, 2)
  const owner = state.players[0]!
  owner.houseType = houseType
  owner.rooms = rooms
  owner.roomTiles = Array.from({ length: rooms }, (_, index) => ({
    row: index % 3, col: Math.floor(index / 3),
  }))
  Object.assign(owner.resources, { clay: 0, stone: 0, reed: 0 }, resources)
  session.loadState(state)
  return session
}

describe('C013 Wood Slide Hammer parity', () => {
  it('C013 S1: paying one wood plays Wood Slide Hammer', () => {
    const response = playCard(setup())

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.minorPlayed).toContain(CARD_ID)
    expect(response.state.players[0]!.resources.wood).toBe(0)
  })

  it('C013 S2: five wood rooms renovate directly to stone with the discount', () => {
    const session = buyThenPrepare({ rooms: 5, resources: { stone: 3, reed: 1 } })

    const response = session.takeAction(0, 'house-redevelopment')

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.houseType).toBe('stone')
    expect(response.state.players[0]!.resources).toMatchObject({ stone: 0, reed: 0 })
  })

  it('C013 S3: four wood rooms cannot renovate directly to stone and follow the clay path', () => {
    const session = buyThenPrepare({ rooms: 4, resources: { clay: 4, reed: 1 } })

    const response = session.takeAction(0, 'house-redevelopment')

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.houseType).toBe('clay')
    expect(response.state.players[0]!.resources).toMatchObject({ clay: 0, reed: 0 })
  })

  it('C013 S4: five clay rooms receive no discount on a normal stone renovation', () => {
    const session = buyThenPrepare({
      rooms: 5, houseType: 'clay', resources: { stone: 5, reed: 1 },
    })

    const response = session.takeAction(0, 'house-redevelopment')

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.houseType).toBe('stone')
    expect(response.state.players[0]!.resources).toMatchObject({ stone: 0, reed: 0 })
  })
  it.each([false, true])('retains both affordable targets without duplicates (Conservator %s)', (conservator) => {
    const session = buyThenPrepare({ rooms: 5, resources: { clay: 5, stone: 3, reed: 1 } })
    session.state.players[0]!.occupationPlayed = ['A110_Roughcaster', ...(conservator ? ['A087_Conservator'] : [])]
    const offered = session.takeAction(0, 'house-redevelopment')
    expect(options(offered).map((option) => option.value).sort()).toEqual(['clay', 'stone'])
    const response = session.resolveChoice(0, 'stone')
    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.houseType).toBe('stone')
    expect(response.state.players[0]!.resources).toMatchObject({ clay: 5, stone: 0, reed: 0, food: 0 })
  })

  it('cannot use the direct renovation without its full discounted payment', () => {
    const session = buyThenPrepare({ rooms: 5, resources: { stone: 2, reed: 1 } })
    const response = session.takeAction(0, 'house-redevelopment')
    expect(response.ok).toBe(false)
    expect(response.state.players[0]!.houseType).toBe('wood')
    expect(response.state.players[0]!.resources).toMatchObject({ stone: 2, reed: 1 })
  })

})
