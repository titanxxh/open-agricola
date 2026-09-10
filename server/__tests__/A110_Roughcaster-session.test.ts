import { describe, expect, it } from 'vitest'
import { GameSession, type SessionResponse } from '../game/authoritative-session'
import { setWorkersAtHome } from '../../shared/domain/player'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'

import '../../shared/cards/A/A110_Roughcaster'
import '../../shared/cards/A/A087_Conservator'

const CARD_ID = 'A110_Roughcaster'
const FILLER = '__test_placeholder__'

const setup = ({
  played = true, houseType = 'wood' as 'wood' | 'clay', resources = {}, conservator = false,
}: {
  played?: boolean
  houseType?: 'wood' | 'clay'
  resources?: Partial<Record<'wood' | 'clay' | 'reed' | 'stone', number>>
  conservator?: boolean
} = {}) => {
  const session = new GameSession(6110, undefined, { playerCount: 2 })
  const state = session.getState().state
  stabilizeRandomHands(state.players)
  state.currentPlayerIndex = 0
  state.round = 14
  state.roundPhase = 'work'
  state.availableMajorImprovements = []
  state.players.forEach((player) => {
    setWorkersAtHome(state, player, 2)
    player.minorHand = [FILLER]
    player.occupationHand = [FILLER]
    player.minorPlayed = []
    player.occupationPlayed = []
    player.resources = {
      ...player.resources, wood: 0, clay: 0, reed: 0, stone: 0, food: 0, grain: 0,
      vegetable: 0, sheep: 0, boar: 0, cattle: 0,
    }
  })
  const player = state.players[0]!
  player.occupationHand = played ? [FILLER] : [CARD_ID]
  player.occupationPlayed = [
    ...(played ? [CARD_ID] : []),
    ...(conservator ? ['A087_Conservator'] : []),
  ]
  player.houseType = houseType
  Object.assign(player.resources, resources)
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

const buildRoom = (session: GameSession) => {
  let response = session.takeAction(0, 'farm-expansion')
  expect(response.ok, response.error).toBe(true)
  if (response.interaction.stateId !== 'wait') return response
  if (response.interaction.request.farm?.farmType !== 'room') {
    const construct = response.interaction.request.options?.find(
      (option) => option.labelKey === 'actions.construct.name',
    )
    expect(construct).toBeDefined()
    response = session.resolveChoice(response.interaction.playerIndex, construct!.value)
  }
  expect(response.interaction.stateId).toBe('wait')
  if (response.interaction.stateId !== 'wait') return response
  expect(response.interaction.request.farm?.farmType).toBe('room')
  const room = response.interaction.request.farm?.selectableTiles[0]
  expect(room).toBeDefined()
  return session.commitSelectionChoice(response.interaction.playerIndex, { rooms: [room!] })
}

const renovate = (session: GameSession, target?: 'clay' | 'stone'): SessionResponse => {
  let response = session.takeAction(0, 'house-redevelopment')
  expect(response.ok, response.error).toBe(true)
  if (response.interaction.stateId === 'wait'
    && response.interaction.promptKey === 'ui.interactionChooseRenovationTarget') {
    expect(target).toBeDefined()
    response = session.resolveChoice(response.interaction.playerIndex, target!)
  }
  return response
}

describe('A110 Roughcaster parity', () => {
  it('A110 S1: Roughcaster is played as the first occupation without paying food', () => {
    const response = playOccupation(setup({ played: false }))

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.occupationPlayed).toContain(CARD_ID)
    expect(response.state.players[0]!.resources.food).toBe(0)
  })

  it('A110 S2: building at least one clay room gains three food', () => {
    const response = buildRoom(setup({
      houseType: 'clay', resources: { clay: 5, reed: 2 },
    }))

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]).toMatchObject({
      houseType: 'clay', rooms: 3, resources: { food: 3 },
    })
  })

  it('A110 S3: renovating a clay house to stone gains three food', () => {
    const response = renovate(setup({
      houseType: 'clay', resources: { stone: 2, reed: 1 },
    }))

    expect(response.state.players[0]).toMatchObject({
      houseType: 'stone', resources: { food: 3 },
    })
  })

  it('A110 S4: building a wood room grants no food', () => {
    const response = buildRoom(setup({ resources: { wood: 5, reed: 2 } }))

    expect(response.state.players[0]).toMatchObject({
      houseType: 'wood', rooms: 3, resources: { food: 0 },
    })
  })

  it('A110 S5: renovating a wood house to clay grants no food', () => {
    const response = renovate(setup({ resources: { clay: 2, reed: 1 } }))

    expect(response.state.players[0]).toMatchObject({
      houseType: 'clay', resources: { food: 0 },
    })
  })

  it('A110 S6: a Conservator renovation directly from wood to stone grants no food', () => {
    const response = renovate(setup({
      conservator: true, resources: { stone: 2, reed: 1 },
    }), 'stone')

    expect(response.state.players[0]).toMatchObject({
      houseType: 'stone', resources: { food: 0 },
    })
  })
})
