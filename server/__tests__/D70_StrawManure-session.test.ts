import { type SessionResponse } from '../game/authoritative-session'
import { setWorkersAtHome } from '../../shared/domain/player'

import { describe, expect, it } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'

import { markAllWorkersUsed, setActiveWorkerCount } from '../../shared/domain/player'
import '../../shared/cards/D/D070_StrawManure'
import '../../shared/cards/B/B068_Beanfield'
import { autoAdvanceRoundEnd } from '../../tests/llm-card-gen/session-helpers'
import { resolveNonSkipChoice, resolveSkipChoice, resolveTriggerIfPresent } from './_helpers/trigger-select'

const CARD_ID = 'D070_StrawManure'

describe('D070_StrawManure session', () => {
  const setupHarvest = (includeCardField = false) => {
    const session = new GameSession()
    stabilizeRandomHands(session.state.players)
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    state.round = 4
    state.players.forEach((player) => {
      markAllWorkersUsed(state, player)
      setActiveWorkerCount(player, 1)
      player.resources.food = 10
    })

    const player = state.players[0]!
    player.minorPlayed.push('D070_StrawManure')
    player.resources.grain = 3

    // Two vegetable fields with crops + one grain field
    player.fields = [
      { row: 0, col: 0, stacks: [{ kind: 'vegetable', remaining: 2 }] },
      { row: 0, col: 1, stacks: [{ kind: 'vegetable', remaining: 1 }] },
      { row: 0, col: 2, stacks: [{ kind: 'grain', remaining: 3 }] },
    ]
    if (includeCardField) {
      player.minorPlayed.push('B068_Beanfield')
      player.cardStates.B068_Beanfield = {
        extraData: { cardFieldStacks: [{ crop: 'vegetable', remaining: 2 }] },
      }
    }

    session.loadState(state)
    return { session, player: state.players[0]! }
  }

  it('pays 1 grain and adds 1 vegetable to up to 2 selected vegetable fields', () => {
    const { session } = setupHarvest()

    let resp = session.performRoundEnd()
    resp = resolveTriggerIfPresent(session, resp, CARD_ID)
    resp = resolveNonSkipChoice(session, resp)

    expect(resp.interaction.stateId).toBe('wait')
    if (resp.interaction.stateId !== 'wait') throw new Error('expected selection choice')

    resp = session.commitSelectionChoice(0, { positions: [{ row: 0, col: 0 }, { row: 0, col: 1 }] })
    expect(resp.ok).toBe(true)

    autoAdvanceRoundEnd(session, { initialResponse: resp })

    const p = session.getState().state.players[0]!
    // Initial grain=3, paid 1, harvested 1 from grain field: 3 - 1 + 1 = 3
    expect(p.resources.grain).toBe(3)

    // After card effect: field 0-0 remaining 2→3, then normal harvest reaps 1 → 2
    const f0 = p.fields.find(f => f.row === 0 && f.col === 0)!
    expect(f0.stacks[0]?.remaining ?? 0).toBe(2)

    // After card effect: field 0-1 remaining 1→2, then normal harvest reaps 1 → 1
    const f1 = p.fields.find(f => f.row === 0 && f.col === 1)!
    expect(f1.stacks[0]?.remaining ?? 0).toBe(1)

    // Player gained vegetables from harvest: 2 (normal) from 2 veg fields
    expect(p.resources.vegetable).toBeGreaterThanOrEqual(2)

    // Grain field: was 3, harvested 1 → remaining 2
    const f2 = p.fields.find(f => f.row === 0 && f.col === 2)!
    expect(f2.stacks[0]?.remaining ?? 0).toBe(2)
  })

  it('player can decline the optional effect', () => {
    const { session } = setupHarvest()

    let resp = session.performRoundEnd()
    resp = resolveTriggerIfPresent(session, resp, CARD_ID)
    resp = resolveSkipChoice(session, resp)

    autoAdvanceRoundEnd(session, { initialResponse: resp })

    const p = session.getState().state.players[0]!
    // Grain not spent: initial 3 + 1 from harvest = 4
    expect(p.resources.grain).toBe(4)
  })

  it('adds and then reaps a vegetable on a selected Card Field', () => {
    const { session } = setupHarvest(true)

    let resp = session.performRoundEnd()
    resp = resolveTriggerIfPresent(session, resp, CARD_ID)
    resp = resolveNonSkipChoice(session, resp)
    resp = session.commitSelectionChoice(0, { positions: [{ row: -1, col: 2068 }] })
    expect(resp.ok).toBe(true)

    autoAdvanceRoundEnd(session, { initialResponse: resp })

    expect(session.getState().state.players[0]!.cardStates.B068_Beanfield?.extraData?.cardFieldStacks)
      .toEqual([{ crop: 'vegetable', remaining: 2 }])
  })

  it('does not trigger when player has no grain', () => {
    const session = new GameSession()
    stabilizeRandomHands(session.state.players)
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    state.round = 4
    state.players.forEach((player) => {
      markAllWorkersUsed(state, player)
      setActiveWorkerCount(player, 1)
      player.resources.food = 10
    })

    const player = state.players[0]!
    player.minorPlayed.push('D070_StrawManure')
    player.resources.grain = 0
    player.fields = [
      { row: 0, col: 0, stacks: [{ kind: 'vegetable', remaining: 2 }] },
    ]

    session.loadState(state)
    const resp = session.performRoundEnd()
    // No optional choice since grain = 0
    if (resp.interaction.stateId === 'wait') {
      expect(resp.interaction.promptKey).not.toBe('ui.interactionOptionalAction')
    }
  })

  it('does not trigger when no vegetable fields have crops', () => {
    const session = new GameSession()
    stabilizeRandomHands(session.state.players)
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    state.round = 4
    state.players.forEach((player) => {
      markAllWorkersUsed(state, player)
      setActiveWorkerCount(player, 1)
      player.resources.food = 10
    })

    const player = state.players[0]!
    player.minorPlayed.push('D070_StrawManure')
    player.resources.grain = 3
    player.fields = [
      { row: 0, col: 0, stacks: [{ kind: 'grain', remaining: 3 }] },
    ]

    session.loadState(state)
    const resp = session.performRoundEnd()
    // No choice for Straw Manure since no vegetable fields
    if (resp.interaction.stateId === 'wait') {
      expect(resp.interaction.promptKey).not.toBe('ui.interactionOptionalAction')
    }
  })
})

describe('D070 Straw Manure parity', () => {
  const CARD_ID = 'D070_StrawManure'

  const CARD_FIELD = 'B068_Beanfield'

  const FILLER = '__test_placeholder__'

  const options = (response: SessionResponse) => response.interaction.stateId === 'wait'
    ? response.interaction.request.options ?? []
    : []

  const setup = ({
    played = true, grain = 1, ordinaryFields = [2, 1], cardField = 0, harvest = true,
  }: {
    played?: boolean
    grain?: number
    ordinaryFields?: number[]
    cardField?: number
    harvest?: boolean
  } = {}) => {
    const session = new GameSession(6070, undefined, { playerCount: 2 })
    const state = session.getState().state
    stabilizeRandomHands(state.players)
    state.currentPlayerIndex = 0
    state.round = 4
    state.roundPhase = 'work'
    state.actionSpaces.forEach((space) => { space.takenBy = [] })
    state.players.forEach((player, index) => {
      player.minorHand = [FILLER]
      player.occupationHand = [FILLER]
      player.minorPlayed = []
      player.occupationPlayed = []
      player.fields = []
      player.cardStates = {}
      Object.assign(player.resources, {
        wood: 0, clay: 0, reed: 0, stone: 0, food: 20, grain: 0, vegetable: 0,
        sheep: 0, boar: 0, cattle: 0, begging: 0,
      })
      if (harvest) {
        markAllWorkersUsed(state, player)
        setActiveWorkerCount(player, 1)
      } else {
        setWorkersAtHome(state, player, index === 0 ? 2 : 0)
      }
    })

    const owner = state.players[0]!
    owner.minorHand = played ? [FILLER] : [CARD_ID]
    owner.minorPlayed = played ? [CARD_ID] : []
    owner.resources.grain = grain
    owner.fields = ordinaryFields.map((remaining, col) => ({
      row: 0, col: col + 2,
      stacks: remaining > 0 ? [{ kind: 'vegetable' as const, remaining }] : [],
    }))
    if (cardField > 0) {
      owner.minorPlayed.push(CARD_FIELD)
      owner.cardStates[CARD_FIELD] = {
        extraData: { cardFieldStacks: [{ crop: 'vegetable', remaining: cardField }] },
      }
    }
    session.loadState(state)
    return session
  }

  const enterMinorChoice = (session: GameSession) => {
    let response = session.takeAction(0, 'meeting-place')
    if (response.interaction.stateId !== 'wait') return response
    const improvement = options(response).find((option) =>
      option.value.startsWith('action-improvement-'))
    if (improvement) response = session.resolveChoice(response.interaction.playerIndex, improvement.value)
    return response
  }

  const playMinor = (session: GameSession) => {
    let response = enterMinorChoice(session)
    if (response.interaction.stateId !== 'wait') return response
    const card = options(response).find((option) =>
      option.value === CARD_ID || option.value === `minor:${CARD_ID}`)
    if (card) response = session.resolveChoice(response.interaction.playerIndex, card.value)
    return response
  }

  const acceptHarvestEffect = (session: GameSession) => {
    let response = session.performRoundEnd()
    response = resolveTriggerIfPresent(session, response, CARD_ID)
    return resolveNonSkipChoice(session, response)
  }

  const fieldRemaining = (response: SessionResponse, col: number) =>
    response.state.players[0]!.fields.find((field) => field.row === 0 && field.col === col)
      ?.stacks[0]?.remaining ?? 0

  it('D070 S1: two fields allow Straw Manure to be played for free', () => {
    const response = playMinor(setup({ played: false, ordinaryFields: [0, 0], harvest: false }))

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.minorPlayed).toContain(CARD_ID)
  })

  it('D070 S2: one field keeps Straw Manure unavailable', () => {
    const response = enterMinorChoice(setup({ played: false, ordinaryFields: [0], harvest: false }))

    expect(options(response).some((option) =>
      option.value === CARD_ID || option.value === `minor:${CARD_ID}`)).toBe(false)
    expect(response.state.players[0]!.minorHand).toContain(CARD_ID)
  })

  it('D070 S4: paying one grain adds one vegetable to each of two selected fields', () => {
    const session = setup()
    let response = acceptHarvestEffect(session)
    response = session.commitSelectionChoice(0, {
      positions: [{ row: 0, col: 2 }, { row: 0, col: 3 }],
    })
    response = autoAdvanceRoundEnd(session, { initialResponse: response })

    expect(response.state.players[0]!.resources).toMatchObject({ grain: 0, vegetable: 2 })
    expect(fieldRemaining(response, 2)).toBe(2)
    expect(fieldRemaining(response, 3)).toBe(1)
  })

  it('D070 S7: a planted Card Field is selectable together with an ordinary field', () => {
    const session = setup({ ordinaryFields: [1], cardField: 2 })
    let response = acceptHarvestEffect(session)
    response = session.commitSelectionChoice(0, {
      positions: [{ row: 0, col: 2 }, { row: -1, col: 2068 }],
    })
    response = autoAdvanceRoundEnd(session, { initialResponse: response })

    expect(response.state.players[0]!.resources).toMatchObject({ grain: 0, vegetable: 2 })
    expect(fieldRemaining(response, 2)).toBe(1)
    expect(response.state.players[0]!.cardStates[CARD_FIELD]?.extraData?.cardFieldStacks)
      .toEqual([{ crop: 'vegetable', remaining: 2 }])
  })
})
