import { describe, expect, it } from 'vitest'
import { GameSession, type SessionResponse } from '../game/authoritative-session'
import { setWorkersAtHome } from '../../shared/domain/player'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'

import '../../shared/cards/A/A123_FrameBuilder'

const CARD_ID = 'A123_FrameBuilder'

const setup = ({
  houseType = 'wood',
  resources = {},
  inHand = false,
}: {
  houseType?: 'wood' | 'clay' | 'stone'
  resources?: Partial<Record<'wood' | 'clay' | 'stone' | 'reed', number>>
  inHand?: boolean
} = {}) => {
  const session = new GameSession(123, undefined, { playerCount: 2 })
  const state = session.getState().state
  stabilizeRandomHands(state.players)
  state.currentPlayerIndex = 0
  state.round = 6
  const player = state.players[0]!
  setWorkersAtHome(state, player, 2)
  player.occupationHand = inHand ? [CARD_ID] : ['__test_placeholder__']
  player.occupationPlayed = inHand ? [] : [CARD_ID]
  player.houseType = houseType
  player.resources = {
    ...player.resources,
    wood: 0,
    clay: 0,
    stone: 0,
    reed: 0,
    ...resources,
  }
  session.loadState(state)
  return session
}

const chooseOption = (session: GameSession, response: SessionResponse, predicate: (option: NonNullable<SessionResponse['interaction']['request']['options']>[number]) => boolean) => {
  expect(response.interaction.stateId).toBe('wait')
  if (response.interaction.stateId !== 'wait') return response
  const option = response.interaction.request.options?.find(predicate)
  expect(option).toBeDefined()
  return session.resolveChoice(0, option!.value)
}

const openRoomSelection = (session: GameSession) => {
  let response = session.takeAction(0, 'farm-expansion')
  if (
    response.interaction.stateId === 'wait'
    && response.interaction.request.options?.some((option) => option.labelKey === 'actions.construct.name')
  ) {
    response = chooseOption(session, response, (option) => option.labelKey === 'actions.construct.name')
  }
  expect(response.interaction.stateId).toBe('wait')
  if (response.interaction.stateId !== 'wait') return response
  expect(response.interaction.request.farm.farmType).toBe('room')
  return response
}

const renovate = (session: GameSession) => {
  let response = session.takeAction(0, 'house-redevelopment')
  if (response.interaction.stateId === 'wait' && response.interaction.promptKey === 'ui.interactionChooseRenovationTarget') {
    response = session.resolveChoice(0, 'clay')
  }
  return response
}

describe('A123 Frame Builder parity', () => {
  it('A123 S1: playing Frame Builder through Lessons keeps the occupation in play', () => {
    const session = setup({ inHand: true })
    let response = session.takeAction(0, 'lessons')
    if (response.interaction.stateId === 'wait') {
      const option = response.interaction.request.options?.find((candidate) => candidate.value === CARD_ID)
      if (option) response = session.resolveChoice(0, option.value)
    }

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.occupationPlayed).toContain(CARD_ID)
  })

  it('A123 S2: each of two clay rooms can replace two clay with one wood', () => {
    const session = setup({ houseType: 'clay', resources: { clay: 6, wood: 2, reed: 4 } })
    const selection = openRoomSelection(session)
    if (selection.interaction.stateId !== 'wait' || selection.interaction.request.farm.farmType !== 'room') return
    const [roomA, roomB] = selection.interaction.request.farm.selectableTiles

    const response = session.commitSelectionChoice(0, { rooms: [roomA!, roomB!] })

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.rooms).toBe(4)
    expect(response.state.players[0]!.resources).toMatchObject({ clay: 0, wood: 0, reed: 0 })
  })

  it('A123 S3: a stone room can replace two stone with one wood', () => {
    const session = setup({ houseType: 'stone', resources: { stone: 3, wood: 1, reed: 2 } })
    const selection = openRoomSelection(session)
    if (selection.interaction.stateId !== 'wait' || selection.interaction.request.farm.farmType !== 'room') return
    const room = selection.interaction.request.farm.selectableTiles[0]!

    const response = session.commitSelectionChoice(0, { rooms: [room] })

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.rooms).toBe(3)
    expect(response.state.players[0]!.resources).toMatchObject({ stone: 0, wood: 0, reed: 0 })
  })

  it('A123 S4: renovation can replace two clay with one wood', () => {
    const response = renovate(setup({ resources: { wood: 1, reed: 1 } }))

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.houseType).toBe('clay')
    expect(response.state.players[0]!.resources).toMatchObject({ wood: 0, reed: 0 })
  })

  it('A123 S5: renovation can decline the optional replacement', () => {
    const session = setup({ resources: { clay: 2, wood: 1, reed: 1 } })
    const payment = renovate(session)

    const response = chooseOption(session, payment, (option) => {
      const resources = option.labelParams?.resourcesPaid
      return resources?.clay === 2 && (resources.wood ?? 0) === 0
    })

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.houseType).toBe('clay')
    expect(response.state.players[0]!.resources).toMatchObject({ clay: 0, wood: 1, reed: 0 })
  })
})
