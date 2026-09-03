import { describe, expect, it } from 'vitest'
import { GameSession, type SessionResponse } from '../game/authoritative-session'
import { setWorkersAtHome } from '../../shared/domain/player'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'

import '../../shared/cards/A/A086_AnimalTamer'

const CARD_ID = 'A086_AnimalTamer'

const setup = ({
  played = true,
  sheep = 0,
  boar = 0,
}: {
  played?: boolean
  sheep?: number
  boar?: number
} = {}) => {
  const session = new GameSession(86, undefined, { playerCount: 2 })
  const state = session.getState().state
  stabilizeRandomHands(state.players)
  state.currentPlayerIndex = 0
  state.round = 5
  const player = state.players[0]!
  setWorkersAtHome(state, player, 2)
  player.occupationHand = played ? ['__test_placeholder__'] : [CARD_ID]
  player.occupationPlayed = played ? [CARD_ID] : []
  player.resources = { ...player.resources, wood: 0, grain: 0, sheep, boar, cattle: 0 }
  player.pastures = []
  player.stableTiles = []
  player.houseAnimalType = sheep > 0 ? 'sheep' : null
  player.houseAnimalCount = sheep
  state.actionSpaces.find((space) => space.id === 'sheep-market')!.resources.sheep = 0
  state.actionSpaces.find((space) => space.id === 'pig-market')!.resources.boar = 0
  session.loadState(state)
  return session
}

const chooseGain = (session: GameSession, response: SessionResponse, resource: 'wood' | 'grain') => {
  expect(response.interaction.stateId).toBe('wait')
  if (response.interaction.stateId !== 'wait') return response
  const option = response.interaction.request.options?.find((candidate) =>
    JSON.stringify(candidate.effectPreview).includes(`\"${resource}\":1`)
  )
  expect(option).toBeDefined()
  return session.resolveChoice(0, option!.value)
}

const animalReorg = (response: SessionResponse) => {
  expect(response.ok, response.error).toBe(true)
  expect(response.interaction.stateId).toBe('wait')
  if (response.interaction.stateId !== 'wait' || response.interaction.request.kind !== 'animal-reorg') {
    throw new Error('expected animal reorganization')
  }
  return response
}

describe('A086 Animal Tamer parity', () => {
  it('A086 S1: playing Animal Tamer can grant one wood', () => {
    const session = setup({ played: false })

    const response = chooseGain(session, session.takeAction(0, 'lessons'), 'wood')

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.occupationPlayed).toContain(CARD_ID)
    expect(response.state.players[0]!.resources).toMatchObject({ wood: 1, grain: 0 })
  })

  it('A086 S2: playing Animal Tamer can grant one grain', () => {
    const session = setup({ played: false })

    const response = chooseGain(session, session.takeAction(0, 'lessons'), 'grain')

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.occupationPlayed).toContain(CARD_ID)
    expect(response.state.players[0]!.resources).toMatchObject({ wood: 0, grain: 1 })
  })

  it('A086 S3: the two-room house stores two sheep', () => {
    const session = setup()
    session.state.actionSpaces.find((space) => space.id === 'sheep-market')!.resources.sheep = 2
    const pending = animalReorg(session.takeAction(0, 'sheep-market'))
    const house = pending.interaction.request.zones.find((zone) => zone.id === 'house')
    expect(house?.capacity).toBe(2)

    const response = session.resolveChoice(0, 'confirm', [
      { id: 'house', zoneType: 'house', animalType: 'sheep', animalCount: 2 },
    ] as unknown as Record<string, unknown>)

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources.sheep).toBe(2)
    expect(response.state.players[0]!.houseAnimalCount).toBe(2)
  })

  it('A086 S4: without Animal Tamer the house holds only one animal total', () => {
    const session = setup({ played: false })
    session.state.players[0]!.occupationHand = ['__test_placeholder__']
    session.state.actionSpaces.find((space) => space.id === 'sheep-market')!.resources.sheep = 2
    session.loadState(session.state)
    const pending = animalReorg(session.takeAction(0, 'sheep-market'))

    const response = session.resolveChoice(0, 'confirm', [
      { id: 'house', zoneType: 'house', animalType: 'sheep', animalCount: 1 },
    ] as unknown as Record<string, unknown>)

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources.sheep).toBe(1)
    expect(response.state.players[0]!.houseAnimalCount).toBe(1)
  })

  it('A086 S5: the two-room house cannot persist one sheep and one boar', () => {
    const session = setup({ sheep: 1 })
    session.state.actionSpaces.find((space) => space.id === 'pig-market')!.resources.boar = 1
    session.loadState(session.state)
    const pending = animalReorg(session.takeAction(0, 'pig-market'))

    const response = session.resolveChoice(0, 'confirm', [
      { id: 'house', zoneType: 'house', animalType: 'sheep', animalCount: 1 },
      { id: 'house', zoneType: 'house', animalType: 'boar', animalCount: 1 },
    ] as unknown as Record<string, unknown>)

    expect(response.ok, response.error).toBe(true)
    expect(response.interaction.stateId === 'wait' ? response.interaction.request.kind : undefined)
      .toBe('animal-reorg')
    expect(response.state.players[0]!.resources).toMatchObject({ sheep: 1, boar: 1 })
    expect(response.state.players[0]!.houseAnimalType).toBe('sheep')
    expect(response.state.players[0]!.houseAnimalCount).toBe(1)
  })
})
