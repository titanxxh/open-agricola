import { setWorkersAtHome } from '../../shared/domain/player'

import { describe, expect, it } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'
import {
  executeCardListener,
  getRegisteredCardListeners,
  type CardListenerContext,
} from '../../shared/cards/card-listeners'

import '../../shared/cards/E/E161_ElderBaker'

const CARD_ID = 'E161_ElderBaker'
const LISTENER_ID = 'E161-elder-baker-compute-choice-candidates'
const STONE_OVEN_ID = 'Major_StoneOven'

const findListener = (id: string) =>
  getRegisteredCardListeners().find((l) => l.id === id)

const setup = (
  overrides: {
    playE161?: boolean
    availableMajors?: string[]
  } = {},
) => {
  const session = new GameSession()
  stabilizeRandomHands(session.state.players)
  const state = session.getState().state
  state.players = state.players.slice(0, 2)
  state.round = 3
  state.roundPhase = 'work'
  state.currentPlayerIndex = 0

  state.players[0]!.workersAvailable = 1
  state.players[0]!.familySize = 1
  state.players[1]!.workersAvailable = 0
  state.players[1]!.familySize = 1

  const owner = state.players[0]!
  if (overrides.playE161 !== false) {
    owner.occupationPlayed.push(CARD_ID)
  }
  // Plenty of resources to keep Stone Oven affordable (cost 1 stone).
  owner.resources = {
    ...owner.resources,
    food: 10,
    wood: 5,
    clay: 5,
    stone: 5,
    reed: 5,
    grain: 0,
    vegetable: 0,
    sheep: 0,
    boar: 0,
    cattle: 0,
  }
  if (overrides.availableMajors) {
    state.availableMajorImprovements = overrides.availableMajors.slice()
  }

  session.loadState(state)
  return session
}

describe('E161_ElderBaker computeChoiceCandidates listener (unit)', () => {
  it('injects Major_StoneOven candidate when owner played E161', () => {
    const session = setup()
    const state = session.getState().state
    const player = state.players[0]!
    const listener = findListener(LISTENER_ID)
    expect(listener).toBeDefined()

    const result = executeCardListener(listener!, {
      state,
      player,
      actionId: 'improvement',
      phase: 'computeChoiceCandidates',
    } as unknown as CardListenerContext)

    expect(result?.extraOptions).toBeDefined()
    const values = result!.extraOptions!.map((o) => o.value)
    expect(values).toContain(STONE_OVEN_ID)
    expect(result!.extraOptions![0]!.sourceCard).toBe(CARD_ID)
  })

  it('returns nothing when owner has not played E161', () => {
    const session = setup({ playE161: false })
    const state = session.getState().state
    const player = state.players[0]!
    const listener = findListener(LISTENER_ID)!

    const result = executeCardListener(listener, {
      state,
      player,
      actionId: 'improvement',
      phase: 'computeChoiceCandidates',
    } as unknown as CardListenerContext)

    expect(result).toBeUndefined()
  })

  it('returns nothing when Stone Oven is no longer in supply', () => {
    const session = setup({
      availableMajors: ['Major_Fireplace1', 'Major_Well'],
    })
    const state = session.getState().state
    const player = state.players[0]!
    const listener = findListener(LISTENER_ID)!

    const result = executeCardListener(listener, {
      state,
      player,
      actionId: 'improvement',
      phase: 'computeChoiceCandidates',
    } as unknown as CardListenerContext)

    expect(result).toBeUndefined()
  })
})

describe('E161_ElderBaker session integration', () => {
  const enterMinorChoice = (session: GameSession) => {
    let resp = session.takeAction(0, 'meeting-place')
    expect(resp.ok).toBe(true)
    expect(resp.interaction.stateId).toBe('wait')
    resp = session.resolveChoice(0, 'action-improvement-1')
    return resp
  }

  it('minor-improvement choice list contains Major_StoneOven candidate', () => {
    const session = setup()
    const state = session.getState().state
    state.players[0]!.minorHand = []
    session.loadState(state)

    const resp = enterMinorChoice(session)
    expect(resp.ok).toBe(true)
    expect(resp.interaction.stateId).toBe('wait')
    const values = (resp.interaction.request.options ?? []).map((o) => o.value)
    expect(values).toContain(STONE_OVEN_ID)
  })

  it('selecting Major_StoneOven via minor-improvement plays it as a major', () => {
    const session = setup()
    const state = session.getState().state
    state.players[0]!.minorHand = []
    session.loadState(state)

    let resp = enterMinorChoice(session)
    expect(resp.ok).toBe(true)
    expect(resp.interaction.stateId).toBe('wait')
    const stoneOvenOption = resp.interaction.request.options?.find((o) => o.value === STONE_OVEN_ID)
    expect(stoneOvenOption).toBeDefined()
    resp = session.resolveChoice(0, stoneOvenOption!.value)

    let steps = 0
    while (resp.interaction.stateId === 'wait' && steps < 20) {
      steps++
      const opts = resp.interaction.request.options ?? []
      const next =
        opts.find((o) => o.value !== '__skip__' && o.value !== 'cancel') ?? opts[0]
      if (!next) break
      resp = session.resolveChoice(0, next.value)
    }
    expect(resp.state.players[0]!.improvements).toContain(STONE_OVEN_ID)
    expect(resp.state.availableMajorImprovements).not.toContain(STONE_OVEN_ID)
  })

  it('non-E161 owner: minor-improvement does NOT have Stone Oven', () => {
    const session = setup({ playE161: false })
    const state = session.getState().state
    state.players[0]!.minorHand = []
    session.loadState(state)

    const resp = enterMinorChoice(session)
    if (!resp.ok || resp.interaction.stateId !== 'wait') return
    const values = (resp.interaction.request.options ?? []).map((o) => o.value)
    expect(values).not.toContain(STONE_OVEN_ID)
  })
})

describe('E161 Elder Baker parity', () => {
  const CARD_ID = 'E161_ElderBaker'

  const STONE_OVEN_ID = 'Major_StoneOven'

  const FILLER = '__test_placeholder__'

  const baseSession = ({
    played = true, grain = 0, stoneOvenAvailable = true,
  }: { played?: boolean; grain?: number; stoneOvenAvailable?: boolean } = {}) => {
    const session = new GameSession(6161, undefined, { playerCount: 4 })
    stabilizeRandomHands(session.state.players)
    const state = session.getState().state
    state.currentPlayerIndex = 0
    state.round = 5
    state.roundPhase = 'work'
    state.actionSpaces.forEach((space) => { space.takenBy = [] })
    state.players.forEach((player, index) => {
      setWorkersAtHome(state, player, 2)
      player.minorHand = [FILLER]
      player.occupationHand = [FILLER]
      player.minorPlayed = []
      player.occupationPlayed = []
      player.improvements = []
      player.cardStates = {}
      Object.assign(player.resources, {
        wood: 0, clay: index === 0 ? 1 : 0, reed: 0, stone: index === 0 ? 3 : 0,
        food: 20, grain: index === 0 ? grain : 0, vegetable: 0, sheep: 0, boar: 0,
        cattle: 0, begging: 0,
      })
    })
    const owner = state.players[0]!
    owner.occupationHand = played ? [FILLER] : [CARD_ID]
    owner.occupationPlayed = played ? [CARD_ID] : []
    if (!stoneOvenAvailable) {
      state.availableMajorImprovements = state.availableMajorImprovements
        .filter((cardId) => cardId !== STONE_OVEN_ID)
    }
    session.loadState(state)
    return session
  }

  const setupPlayed = (configuration: { grain?: number; stoneOvenAvailable?: boolean } = {}) => {
    return baseSession({ ...configuration, played: true })
  }

  it('E161 S2: the owner uses the private Elder Baker action space to gain three grain', () => {
    const response = setupPlayed().takeAction(0, CARD_ID)

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources.grain).toBe(3)
  })

  it('E161 S3: a non-owner cannot use the private Elder Baker action space', () => {
    const session = setupPlayed()
    const before = session.getState()
    const response = session.takeAction(1, CARD_ID)

    expect(session.getActionAvailability(1)[CARD_ID]).toBe(false)
    expect(response.ok).toBe(false)
    expect(response.state.players[1]!.resources.grain).toBe(0)
    expect(response.state.actionSpaces.find((space) => space.id === CARD_ID)?.takenBy)
      .toEqual(before.state.actionSpaces.find((space) => space.id === CARD_ID)?.takenBy)
  })
})
