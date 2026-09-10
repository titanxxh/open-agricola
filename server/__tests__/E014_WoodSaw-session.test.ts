import { describe, expect, it } from 'vitest'
import { GameSession, type SessionResponse } from '../game/authoritative-session'
import { setActiveWorkerCount } from '../../shared/domain/player'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'
import '../../shared/cards/E/E014_WoodSaw'

const CARD_ID = 'E014_WoodSaw'

const ANYTIME_ID = 'E14-wood-saw-anytime'

const FILLER = '__test_placeholder__'

const setup = ({
  played = true, familySizes = [2, 3, 3], wood = 0, reed = 0,
}: {
  played?: boolean
  familySizes?: [number, number, number]
  wood?: number
  reed?: number
} = {}) => {
  const session = new GameSession(6014, undefined, { playerCount: 3 })
  stabilizeRandomHands(session.state.players)
  const state = session.getState().state
  state.currentPlayerIndex = 0
  state.round = 14
  state.roundPhase = 'work'
  state.availableMajorImprovements = []
  state.actionSpaces.forEach((space) => { space.takenBy = [] })
  state.players.forEach((player, index) => {
    player.minorHand = [FILLER]
    player.occupationHand = [FILLER]
    player.minorPlayed = []
    player.occupationPlayed = []
    setActiveWorkerCount(player, familySizes[index]!)
    Object.assign(player.resources, {
      wood: 0, clay: 0, reed: 0, stone: 0, food: 20, grain: 0, vegetable: 0,
      sheep: 0, boar: 0, cattle: 0, begging: 0,
    })
  })
  const owner = state.players[0]!
  owner.minorHand = played ? [FILLER] : [CARD_ID]
  owner.minorPlayed = played ? [CARD_ID] : []
  owner.resources.wood = wood
  owner.resources.reed = reed
  session.loadState(state)
  return session
}

const options = (response: SessionResponse) => response.interaction.stateId === 'wait'
  ? response.interaction.request.options ?? []
  : []

const play = (session: GameSession) => {
  let response = session.takeAction(0, 'meeting-place')
  if (response.interaction.stateId !== 'wait') return response
  if (!options(response).some((option) => option.value === CARD_ID)) {
    const improvement = options(response).find((option) =>
      option.value.startsWith('action-improvement-'))
    if (improvement) {
      response = session.resolveChoice(response.interaction.playerIndex, improvement.value)
    }
  }
  if (response.interaction.stateId !== 'wait') return response
  const card = options(response).find((option) => option.value === CARD_ID)
  if (card) response = session.resolveChoice(response.interaction.playerIndex, card.value)
  return response
}

const enterWoodSawWindow = (session: GameSession) => {
  const response = session.takeAction(0, 'farmland')
  expect(response.ok, response.error).toBe(true)
  return response
}

const woodSawOffered = (response: SessionResponse) =>
  response.interaction.anytimeActions.some((action) => action.id === ANYTIME_ID)

const enterWoodSawBuild = (session: GameSession) => {
  const active = enterWoodSawWindow(session)
  expect(woodSawOffered(active)).toBe(true)
  let response = session.takeAnytimeAction(0, ANYTIME_ID)
  expect(response.ok, response.error).toBe(true)
  if (response.interaction.stateId === 'wait'
    && response.interaction.request.kind === 'choice') {
    const accept = options(response).find((option) => option.value !== '__skip__')
    expect(accept).toBeDefined()
    response = session.resolveChoice(response.interaction.playerIndex, accept!.value)
  }
  expect(response.interaction).toMatchObject({
    stateId: 'wait',
    sourceCard: CARD_ID,
    request: { kind: 'farm-select', farm: { farmType: 'room' } },
  })
  return response
}

describe('E014 Wood Saw parity', () => {
  it('E014 S1: paying one wood plays Wood Saw', () => {
    const response = play(setup({ played: false, wood: 1 }))

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.minorPlayed).toContain(CARD_ID)
    expect(response.state.players[0]!.resources.wood).toBe(0)
  })

  it('E014 S2: when every opponent has more people Wood Saw builds a room without another person', () => {
    const session = setup({ wood: 5, reed: 2 })
    const build = enterWoodSawBuild(session)
    if (build.interaction.stateId !== 'wait'
      || build.interaction.request.kind !== 'farm-select') return
    const room = build.interaction.request.farm.selectableTiles[0]
    expect(room).toBeDefined()

    const response = session.commitSelectionChoice(build.interaction.playerIndex, { rooms: [room!] })

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]).toMatchObject({
      rooms: 3,
      resources: { wood: 0, reed: 0 },
    })
    expect(response.state.actionSpaces.find((space) => space.id === 'farmland')!.takenBy)
      .toHaveLength(1)
    expect(response.state.actionSpaces.find((space) => space.id === 'farm-expansion')!.takenBy)
      .toHaveLength(0)
  })

  it('E014 S3: Wood Saw grants the full Build Rooms action and can build two rooms', () => {
    const session = setup({ wood: 10, reed: 4 })
    const build = enterWoodSawBuild(session)
    if (build.interaction.stateId !== 'wait'
      || build.interaction.request.kind !== 'farm-select') return
    const rooms = build.interaction.request.farm.selectableTiles.slice(0, 2)
    expect(rooms).toHaveLength(2)
    expect(build.interaction.request.farm.maxSelections).toBeGreaterThanOrEqual(2)

    const response = session.commitSelectionChoice(build.interaction.playerIndex, { rooms })

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.rooms).toBe(4)
    expect(response.state.players[0]!.resources).toMatchObject({ wood: 0, reed: 0 })
  })

  it('E014 S4: equal family size with every opponent gives no Wood Saw action', () => {
    const response = enterWoodSawWindow(setup({ familySizes: [2, 2, 2] }))

    expect(woodSawOffered(response)).toBe(false)
  })

  it('E014 S5: one opponent with equal family size blocks Wood Saw even if another has more', () => {
    const response = enterWoodSawWindow(setup({ familySizes: [2, 3, 2] }))

    expect(woodSawOffered(response)).toBe(false)
  })
})
