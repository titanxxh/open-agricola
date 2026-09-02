import { describe, expect, it } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { setWorkersAtHome } from '../../shared/domain/player'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'

import '../../shared/cards/A/A143_Stonecutter'
import '../../shared/cards/E/E047_SyrupTap'

const CARD_ID = 'A143_Stonecutter'

const setup = ({
  played = true,
  houseType = 'wood',
  resources = {},
  minorHand = ['__test_placeholder__'],
}: {
  played?: boolean
  houseType?: 'wood' | 'clay' | 'stone'
  resources?: Partial<Record<'wood' | 'clay' | 'stone' | 'reed', number>>
  minorHand?: string[]
} = {}) => {
  const session = new GameSession(143, undefined, { playerCount: 3 })
  const state = session.getState().state
  stabilizeRandomHands(state.players)
  state.currentPlayerIndex = 0
  state.round = 6
  state.players.forEach((player) => {
    player.minorHand = ['__test_placeholder__']
    player.occupationHand = ['__test_placeholder__']
  })
  const player = state.players[0]!
  setWorkersAtHome(state, player, 2)
  player.occupationHand = played ? ['__test_placeholder__'] : [CARD_ID]
  player.occupationPlayed = played ? [CARD_ID] : []
  player.minorHand = minorHand
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

const chooseCardIfNeeded = (session: GameSession, response: ReturnType<GameSession['takeAction']>, cardId: string) => {
  if (response.interaction.stateId !== 'wait') return response
  const option = response.interaction.request.options?.find((candidate) => candidate.value === cardId)
  return option ? session.resolveChoice(0, option.value) : response
}

const openRoomSelection = (session: GameSession) => {
  let response = session.takeAction(0, 'farm-expansion')
  if (response.interaction.stateId === 'wait') {
    const construct = response.interaction.request.options?.find((option) => option.labelKey === 'actions.construct.name')
    if (construct) response = session.resolveChoice(0, construct.value)
  }
  expect(response.interaction.stateId).toBe('wait')
  if (response.interaction.stateId !== 'wait') return response
  expect(response.interaction.request.farm.farmType).toBe('room')
  return response
}

describe('A143 Stonecutter parity', () => {
  it('A143 S1: playing Stonecutter through Lessons keeps the occupation in play', () => {
    const session = setup({ played: false })

    const response = chooseCardIfNeeded(session, session.takeAction(0, 'lessons'), CARD_ID)

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.occupationPlayed).toContain(CARD_ID)
  })

  it('A143 S2: Basketmakers Workshop costs one fewer stone', () => {
    const session = setup({ resources: { stone: 1, reed: 2 } })

    const response = chooseCardIfNeeded(session, session.takeAction(0, 'major-improvement'), 'Major_Basket')

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.improvements).toContain('Major_Basket')
    expect(response.state.players[0]!.resources).toMatchObject({ stone: 0, reed: 0 })
  })

  it('A143 S3: a one-stone minor improvement costs no stone', () => {
    const session = setup({ resources: { wood: 1 }, minorHand: ['E047_SyrupTap'] })
    let response = session.takeAction(0, 'meeting-place')
    if (response.interaction.stateId === 'wait') {
      const improvement = response.interaction.request.options?.find((option) =>
        option.value.startsWith('action-improvement-')
      )
      if (improvement) response = session.resolveChoice(0, improvement.value)
    }

    response = chooseCardIfNeeded(session, response, 'E047_SyrupTap')

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.minorPlayed).toContain('E047_SyrupTap')
    expect(response.state.players[0]!.resources).toMatchObject({ wood: 0, stone: 0 })
  })

  it('A143 S4: eight stone cannot pay for two stone rooms', () => {
    const session = setup({ houseType: 'stone', resources: { stone: 8, reed: 4 } })
    const selection = openRoomSelection(session)
    if (selection.interaction.stateId !== 'wait' || selection.interaction.request.farm.farmType !== 'room') return
    expect(selection.interaction.request.farm.maxSelections).toBe(1)
    const [roomA, roomB] = selection.interaction.request.farm.selectableTiles

    const response = session.commitSelectionChoice(0, { rooms: [roomA!, roomB!] })

    expect(response.ok).toBe(false)
    expect(response.state.players[0]!.rooms).toBe(2)
    expect(response.state.players[0]!.resources).toMatchObject({ stone: 8, reed: 4 })
  })

  it('A143 S5: a two-room clay-to-stone renovation costs one fewer stone', () => {
    const session = setup({ houseType: 'clay', resources: { stone: 1, reed: 1 } })

    const response = session.takeAction(0, 'house-redevelopment')

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.houseType).toBe('stone')
    expect(response.state.players[0]!.resources).toMatchObject({ stone: 0, reed: 0 })
  })
})
