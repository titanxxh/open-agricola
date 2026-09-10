import { type SessionResponse } from '../game/authoritative-session'
import { setWorkersAtHome } from '../../shared/domain/player'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'

import { describe, expect, it } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { E001_PoleBarns } from '../../shared/cards/E/E001_PoleBarns'
import { meetsCardPrerequisites } from '../../shared/cards/helpers/prerequisites'
import type { FenceSegment } from '../../shared/contract/types'

describe('E001_PoleBarns prerequisite', () => {
  it('blocks when player has fewer than 15 fence segments on board', () => {
    const session = new GameSession()
    const state = session.getState().state
    const player = state.players[0]!
    player.fenceSegments = []
    expect(meetsCardPrerequisites(player, E001_PoleBarns, state.round, state)).toBe(false)
  })

  it('does not count Wood Palisades toward the 15-fence prerequisite', () => {
    const session = new GameSession()
    const state = session.getState().state
    const player = state.players[0]!
    player.fenceSegments = [
      ...Array.from({ length: 14 }, (_, i): FenceSegment => ({
        edge: `H-0-${i}`,
        type: 'fence',
      })),
      { edge: 'V-0-0', type: 'palisade' },
    ]
    expect(meetsCardPrerequisites(player, E001_PoleBarns, state.round, state)).toBe(false)
  })

  it('allows when player has 15 fence segments on board', () => {
    const session = new GameSession()
    const state = session.getState().state
    const player = state.players[0]!
    player.fenceSegments = Array.from({ length: 15 }, (_, i): FenceSegment => ({
      edge: `H-0-${i}`,
      type: 'fence',
    }))
    expect(meetsCardPrerequisites(player, E001_PoleBarns, state.round, state)).toBe(true)
  })
})

describe('E001 Pole Barns parity', () => {
  const CARD_ID = 'E001_PoleBarns'

  const FILLER = '__test_placeholder__'

  const setup = ({
    ordinaryFences = 15, palisades = 0, stablesOnBoard = 0,
  } = {}) => {
    const session = new GameSession(6001, undefined, { playerCount: 2 })
    stabilizeRandomHands(session.state.players)
    const state = session.getState().state
    state.currentPlayerIndex = 0
    state.round = 14
    state.roundPhase = 'work'
    state.availableMajorImprovements = []
    state.actionSpaces.forEach((space) => { space.takenBy = [] })
    state.players.forEach((player, index) => {
      setWorkersAtHome(state, player, 2)
      player.minorHand = [FILLER]
      player.occupationHand = [FILLER]
      player.minorPlayed = []
      player.occupationPlayed = []
      player.pastures = []
      player.fenceSegments = []
      player.stableTiles = []
      player.cardStates = {}
      Object.assign(player.resources, {
        wood: index === 0 ? 2 : 0, clay: 0, reed: 0, stone: 0,
        food: index === 0 ? 0 : 20, grain: 0, vegetable: 0,
        sheep: 0, boar: 0, cattle: 0, begging: 0,
      })
    })
    const owner = state.players[0]!
    owner.minorHand = [CARD_ID]
    owner.fenceSegments = [
      ...Array.from({ length: ordinaryFences }, (_, index): FenceSegment => ({
        edge: `test-fence-${index}`, type: 'fence',
      })),
      ...Array.from({ length: palisades }, (_, index): FenceSegment => ({
        edge: `test-palisade-${index}`, type: 'palisade',
      })),
    ]
    owner.stableTiles = Array.from({ length: stablesOnBoard }, (_, index) => ({
      row: 2, col: index + 2,
    }))
    session.loadState(state)
    return session
  }

  const options = (response: SessionResponse) => response.interaction.stateId === 'wait'
    ? response.interaction.request.options ?? []
    : []

  const enterMinor = (session: GameSession) => {
    let response = session.takeAction(0, 'meeting-place')
    if (response.interaction.stateId !== 'wait') return response
    if (!options(response).some((option) => option.value === CARD_ID)) {
      const improvement = options(response).find((option) =>
        option.value.startsWith('action-improvement-'))
      if (improvement) response = session.resolveChoice(response.interaction.playerIndex, improvement.value)
    }
    return response
  }

  const play = (session: GameSession) => {
    let response = enterMinor(session)
    if (!response.state.players[0]!.minorHand.includes(CARD_ID)) return response
    if (response.interaction.stateId !== 'wait') return response
    const card = options(response).find((option) => option.value === CARD_ID)
    if (card) response = session.resolveChoice(response.interaction.playerIndex, card.value)
    return response
  }

  const acceptStableBuild = (session: GameSession, response: SessionResponse) => {
    expect(response.interaction.stateId).toBe('wait')
    if (response.interaction.stateId !== 'wait') return response
    const accept = options(response).find((option) => option.value !== '__skip__')
    expect(accept, JSON.stringify(response.interaction)).toBeDefined()
    return session.resolveChoice(response.interaction.playerIndex, accept!.value)
  }

  it('E001 S1: fourteen ordinary fences do not allow Pole Barns to be played', () => {
    const response = enterMinor(setup({ ordinaryFences: 14 }))

    expect(options(response).some((option) => option.value === CARD_ID)).toBe(false)
    expect(response.state.players[0]!.minorHand).toContain(CARD_ID)
    expect(response.state.players[0]!.resources.wood).toBe(2)
  })

  it('E001 S2: a Wood Palisade does not complete the fifteen-fence prerequisite', () => {
    const response = enterMinor(setup({ ordinaryFences: 14, palisades: 1 }))

    expect(options(response).some((option) => option.value === CARD_ID)).toBe(false)
    expect(response.state.players[0]!.minorHand).toContain(CARD_ID)
    expect(response.state.players[0]!.resources.wood).toBe(2)
  })

  it('E001 S3: fifteen ordinary fences and two wood play Pole Barns and build three free stables', () => {
    const session = setup()
    let response = acceptStableBuild(session, play(session))
    expect(response.interaction).toMatchObject({
      stateId: 'wait', request: { kind: 'farm-select', farm: { farmType: 'stable' } },
    })
    if (response.interaction.stateId !== 'wait') return
    const stables = response.interaction.request.farm.selectableTiles.slice(0, 3)
    expect(stables).toHaveLength(3)

    response = session.commitSelectionChoice(response.interaction.playerIndex, { stables })

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[1]!.minorHand).toContain(CARD_ID)
    expect(response.state.players[0]!.resources.wood).toBe(0)
    expect(response.state.players[0]!.stableTiles).toHaveLength(3)
  })

  it('E001 S4: the free stable action may be declined', () => {
    const session = setup()
    const offered = play(session)
    expect(options(offered).some((option) => option.value === '__skip__')).toBe(true)

    const response = session.resolveChoice(offered.interaction.playerIndex, '__skip__')

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources.wood).toBe(0)
    expect(response.state.players[0]!.stableTiles).toHaveLength(0)
  })

  it('E001 S5: the free stable limit is capped by the one stable left in supply', () => {
    const session = setup({ stablesOnBoard: 3 })
    expect(session.getState().state.players[0]!.stableTiles).toHaveLength(3)
    let response = acceptStableBuild(session, play(session))
    expect(response.interaction).toMatchObject({
      stateId: 'wait', request: { kind: 'farm-select', farm: { farmType: 'stable' } },
    })
    if (response.interaction.stateId !== 'wait') return
    expect(response.interaction.request.farm.maxSelections).toBe(1)
    const stable = response.interaction.request.farm.selectableTiles[0]!

    response = session.commitSelectionChoice(response.interaction.playerIndex, { stables: [stable] })

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.stableTiles).toHaveLength(4)
  })
})
