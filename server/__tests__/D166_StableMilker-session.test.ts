import { type SessionResponse } from '../game/authoritative-session'

import { describe, expect, it } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'

import { setWorkersAtHome } from '../../shared/domain/player'
import '../../shared/cards/D/D166_StableMilker'

describe('D166_StableMilker session', () => {
  const setup = () => {
    const session = new GameSession(42)
    stabilizeRandomHands(session.state.players)
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    state.currentPlayerIndex = 0
    state.round = 1

    const player = state.players[0]!
    player.occupationHand.push('D166_StableMilker')
    player.resources.wood = 10
    player.resources.food = 10
    player.resources.cattle = 0
    setWorkersAtHome(state, player, 3)
    state.players[1]!.workersAvailable = 3

    // Make farm-expansion available for stable building
    const farmExpansion = state.actionSpaces.find((s) => s.id === 'farm-expansion')
    if (farmExpansion) {
      farmExpansion.roundAvailable = 1
      farmExpansion.takenBy = []
    }

    session.loadState(state)
    session.devPlayCard(0, 'D166_StableMilker')
    return session
  }

  it('onBuy does not gain cattle when no stables built this turn', () => {
    const session = setup()
    const state = session.getState().state
    const player = state.players[0]!

    // Just played the card, no stables built yet
    expect(player.resources.cattle).toBe(0)
  })

  it('card definition has correct properties', () => {
    const session = setup()
    const state = session.getState().state
    const player = state.players[0]!

    expect(player.occupationPlayed).toContain('D166_StableMilker')
  })
})

describe('D166 Stable Milker parity', () => {
  const CARD_ID = 'D166_StableMilker'

  const FILLER = '__test_placeholder__'

  const setup = ({ played = true, wood = 0 } = {}) => {
    const session = new GameSession(6166, undefined, { playerCount: 4 })
    stabilizeRandomHands(session.state.players)
    const state = session.getState().state
    state.currentPlayerIndex = 0
    state.round = 14
    state.roundPhase = 'work'
    state.availableMajorImprovements = []
    state.actionSpaces.forEach((space) => { space.takenBy = [] })
    state.players.forEach((player) => {
      setWorkersAtHome(state, player, 2)
      player.minorHand = [FILLER]
      player.occupationHand = [FILLER]
      player.minorPlayed = []
      player.occupationPlayed = []
      player.pastures = []
      player.stableTiles = []
      player.resources = {
        ...player.resources, wood: 0, clay: 0, reed: 0, stone: 0, food: 0, grain: 0,
        vegetable: 0, sheep: 0, boar: 0, cattle: 0, begging: 0,
      }
    })
    const owner = state.players[0]!
    owner.occupationHand = played ? [FILLER] : [CARD_ID]
    owner.occupationPlayed = played ? [CARD_ID] : []
    owner.resources.wood = wood
    session.loadState(state)
    return session
  }

  const options = (response: SessionResponse) => response.interaction.stateId === 'wait'
    ? response.interaction.request.options ?? []
    : []

  const playOccupation = (session: GameSession) => {
    let response = session.takeAction(0, 'lessons')
    expect(response.ok, response.error).toBe(true)
    if (!response.state.players[0]!.occupationHand.includes(CARD_ID)) return response
    const card = options(response).find((option) => option.value === CARD_ID)
    expect(card, JSON.stringify(response.interaction)).toBeDefined()
    if (card) response = session.resolveChoice(response.interaction.playerIndex, card.value)
    return response
  }

  const buildStables = (session: GameSession, count: number) => {
    let response = session.takeAction(0, 'farm-expansion')
    expect(response.ok, response.error).toBe(true)
    if (response.interaction.stateId === 'wait'
      && response.interaction.request.kind === 'choice') {
      const stableAction = options(response).find((option) => option.labelKey === 'actions.stables.name')
      expect(stableAction, JSON.stringify(response.interaction)).toBeDefined()
      response = session.resolveChoice(response.interaction.playerIndex, stableAction!.value)
    }
    expect(response.interaction).toMatchObject({
      stateId: 'wait', request: { kind: 'farm-select', farm: { farmType: 'stable' } },
    })
    if (response.interaction.stateId !== 'wait') return response
    const stables = response.interaction.request.farm.selectableTiles.slice(0, count)
    expect(stables).toHaveLength(count)
    return session.commitSelectionChoice(response.interaction.playerIndex, { stables })
  }

  it('D166 S1: Stable Milker is played as the first occupation without gaining cattle', () => {
    const response = playOccupation(setup({ played: false }))

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.occupationPlayed).toContain(CARD_ID)
    expect(response.state.players[0]!.resources.cattle).toBe(0)
  })

  it('D166 S2: building two stables in one turn gains one cattle', () => {
    const response = buildStables(setup({ wood: 4 }), 2)

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.stableTiles).toHaveLength(2)
    expect(response.state.players[0]!.resources).toMatchObject({ wood: 0, cattle: 1 })
  })

  it('D166 S3: building only one stable gains no cattle', () => {
    const response = buildStables(setup({ wood: 2 }), 1)

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.stableTiles).toHaveLength(1)
    expect(response.state.players[0]!.resources).toMatchObject({ wood: 0, cattle: 0 })
  })

  it('D166 S4: building three stables in one action still gains only one cattle', () => {
    const response = buildStables(setup({ wood: 6 }), 3)

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.stableTiles).toHaveLength(3)
    expect(response.state.players[0]!.resources).toMatchObject({ wood: 0, cattle: 1 })
  })
})
