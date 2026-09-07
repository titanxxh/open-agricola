import { describe, expect, it } from 'vitest'
import { GameSession, type SessionResponse } from '../game/authoritative-session'
import { setWorkersAtHome } from '../../shared/domain/player'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'

import '../../shared/cards/D/D088_Millwright'

const CARD_ID = 'D088_Millwright'
const ONE_CELL_FENCES = ['H-1-1', 'H-2-1', 'V-1-1', 'V-1-2']

type BuildingResources = Partial<Record<'wood' | 'clay' | 'reed' | 'stone' | 'grain', number>>

const setup = ({
  played = true, houseType = 'wood', rooms = 2, resources = {},
}: {
  played?: boolean
  houseType?: 'wood' | 'clay' | 'stone'
  rooms?: number
  resources?: BuildingResources
} = {}) => {
  const session = new GameSession(6088, undefined, { playerCount: 2 })
  stabilizeRandomHands(session.state.players)
  const state = session.getState().state
  state.currentPlayerIndex = 0
  state.round = 14
  state.roundPhase = 'work'
  state.actionSpaces.forEach((space) => { space.takenBy = [] })
  state.players.forEach((player) => {
    player.minorHand = ['__test_placeholder__']
    player.occupationHand = ['__test_placeholder__']
    player.minorPlayed = []
    player.occupationPlayed = []
    player.cardStates = {}
    player.resources = {
      ...player.resources,
      wood: 0, clay: 0, reed: 0, stone: 0, food: 20, grain: 0, vegetable: 0,
      sheep: 0, boar: 0, cattle: 0, begging: 0,
    }
    setWorkersAtHome(state, player, 2)
  })
  const owner = state.players[0]!
  owner.occupationHand = played ? ['__test_placeholder__'] : [CARD_ID]
  owner.occupationPlayed = played ? [CARD_ID] : []
  owner.houseType = houseType
  owner.rooms = rooms
  owner.roomTiles = Array.from({ length: rooms }, (_, row) => ({ row, col: 0 }))
  owner.resources = { ...owner.resources, ...resources }
  session.loadState(state)
  return session
}

const chooseCardIfNeeded = (session: GameSession, response: SessionResponse, cardId: string) => {
  if (response.interaction.stateId !== 'wait') return response
  const option = response.interaction.request.options?.find((candidate) => candidate.value === cardId)
  return option ? session.resolveChoice(response.interaction.playerIndex, option.value) : response
}

const chooseOption = (
  session: GameSession,
  response: SessionResponse,
  predicate: (option: NonNullable<SessionResponse['interaction']['request']['options']>[number]) => boolean,
) => {
  expect(response.interaction.stateId).toBe('wait')
  if (response.interaction.stateId !== 'wait') return response
  const option = response.interaction.request.options?.find(predicate)
  expect(option).toBeDefined()
  return session.resolveChoice(response.interaction.playerIndex, option!.value)
}

const paidResources = (option: NonNullable<SessionResponse['interaction']['request']['options']>[number]) =>
  option.labelParams?.resourcesPaid as BuildingResources | undefined

const openRoomSelection = (session: GameSession) => {
  let response = session.takeAction(0, 'farm-expansion')
  if (
    response.interaction.stateId === 'wait'
    && response.interaction.request.options?.some((option) => option.labelKey === 'actions.construct.name')
  ) {
    response = chooseOption(
      session, response, (option) => option.labelKey === 'actions.construct.name',
    )
  }
  expect(response.interaction.stateId).toBe('wait')
  if (response.interaction.stateId !== 'wait') return response
  expect(response.interaction.request.farm.farmType).toBe('room')
  return response
}

const buildOneRoom = (session: GameSession) => {
  const selection = openRoomSelection(session)
  if (selection.interaction.stateId !== 'wait'
    || selection.interaction.request.farm.farmType !== 'room') return selection
  const room = selection.interaction.request.farm.selectableTiles[0]!
  return session.commitSelectionChoice(0, { rooms: [room] })
}

describe('D088 Millwright session', () => {
  it.each([false, true])('keeps exactly two substitutions after repeated reloads and reconnect=%s', (reconnect) => {
    let session = setup({ resources: { wood: 4, reed: 1, grain: 2 } })
    session.loadState(session.state)
    session.loadState(session.state)
    if (reconnect) {
      const state = JSON.parse(JSON.stringify(session.state))
      const cursor = session.createSessionPrivateCursor()
      session = new GameSession(6088, undefined, { playerCount: 2 })
      session.loadState(state)
      session.restoreSessionPrivateCursor(cursor)
    }
    expect(session.getActionAvailability(0)['farm-expansion']).toBe(true)
    const response = buildOneRoom(session)
    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]).toMatchObject({ rooms: 3, resources: { wood: 0, reed: 0, grain: 0 } })
  })

  it('uses both grain substitutions for one four-fence payment', () => {
    const session = setup({ resources: { wood: 2, grain: 2 } })
    expect(session.getActionAvailability(0).fencing).toBe(true)
    expect(session.takeAction(0, 'fencing').ok).toBe(true)
    const response = session.commitSelectionChoice(0, { edges: ONE_CELL_FENCES, extraWood: 0 })
    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.fenceSegments).toHaveLength(4)
    expect(response.state.players[0]!.resources).toMatchObject({ wood: 0, grain: 0 })
  })

  it('D088 S1: playing Millwright through Lessons immediately gains one grain', () => {
    const session = setup({ played: false })

    const response = chooseCardIfNeeded(session, session.takeAction(0, 'lessons'), CARD_ID)

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.occupationPlayed).toContain(CARD_ID)
    expect(response.state.players[0]!.resources.grain).toBe(1)
  })

  it('D088 S2: one grain replaces one wood when building a room', () => {
    const session = setup({ resources: { wood: 4, reed: 2, grain: 1 } })

    const response = buildOneRoom(session)

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]).toMatchObject({
      rooms: 3, resources: { wood: 0, reed: 0, grain: 0 },
    })
  })

  it('D088 S3: two grain replace both wood and reed when building a room', () => {
    const session = setup({ resources: { wood: 5, reed: 2, grain: 2 } })
    const payment = buildOneRoom(session)

    expect(payment.ok, payment.error).toBe(true)
    expect(payment.interaction.stateId).toBe('wait')
    const replacement = payment.interaction.stateId === 'wait'
      ? payment.interaction.request.options?.find((option) => {
      const paid = paidResources(option)
      return paid?.wood === 4 && paid.reed === 1 && paid.grain === 2
        })
      : undefined

    expect(replacement).toBeDefined()
    const response = session.resolveChoice(0, replacement!.value)
    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]).toMatchObject({
      rooms: 3, resources: { wood: 1, reed: 1, grain: 0 },
    })
  })

  it('D088 S4: with the printed resources available the player may replace only one wood', () => {
    const session = setup({ resources: { wood: 5, reed: 2, grain: 1 } })
    const payment = buildOneRoom(session)

    const response = chooseOption(session, payment, (option) => {
      const paid = paidResources(option)
      return paid?.wood === 4 && paid.reed === 2 && paid.grain === 1
    })

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]).toMatchObject({
      rooms: 3, resources: { wood: 1, reed: 0, grain: 0 },
    })
  })

  it('D088 S5: one grain replaces one clay when renovating a two-room wood house', () => {
    const session = setup({ resources: { clay: 1, reed: 1, grain: 1 } })

    const response = session.takeAction(0, 'house-redevelopment')

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]).toMatchObject({
      houseType: 'clay', rooms: 2, resources: { clay: 0, reed: 0, grain: 0 },
    })
  })

  it('D088 S6: one grain replaces one wood when building a stable', () => {
    const session = setup({ resources: { wood: 1, grain: 1 } })
    let response = session.takeAction(0, 'farm-expansion')
    if (
      response.interaction.stateId === 'wait'
      && response.interaction.request.options?.some((option) => option.labelKey === 'actions.stables.name')
    ) {
      response = chooseOption(
        session, response, (option) => option.labelKey === 'actions.stables.name',
      )
    }
    expect(response.interaction.stateId).toBe('wait')
    if (response.interaction.stateId !== 'wait'
      || response.interaction.request.farm.farmType !== 'stable') return
    const stable = response.interaction.request.farm.selectableTiles[0]!

    response = session.commitSelectionChoice(0, { stables: [stable] })

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.stableTiles).toContainEqual(stable)
    expect(response.state.players[0]!.resources).toMatchObject({ wood: 0, grain: 0 })
  })

  it('D088 S7: one grain replaces one wood when building a four-fence pasture', () => {
    const session = setup({ resources: { wood: 3, grain: 1 } })
    const selection = session.takeAction(0, 'fencing')
    expect(selection.ok, selection.error).toBe(true)

    const response = session.commitSelectionChoice(0, { edges: ONE_CELL_FENCES, extraWood: 0 })

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.fenceSegments).toHaveLength(4)
    expect(response.state.players[0]!.resources).toMatchObject({ wood: 0, grain: 0 })
  })

  it('D088 S8: rejects an unpayable fence before occupying the action space', () => {
    const session = setup({ resources: { wood: 1, grain: 3 } })
    expect(session.getActionAvailability(0).fencing).toBe(false)
    const response = session.takeAction(0, 'fencing')
    expect(response.ok).toBe(false)
    expect(response.state.players[0]!.fenceSegments).toHaveLength(0)
    expect(response.state.players[0]!.resources).toMatchObject({ wood: 1, grain: 3 })
    expect(response.state.actionSpaces.find((space) => space.id === 'fencing')?.takenBy).toEqual([])
  })
})
