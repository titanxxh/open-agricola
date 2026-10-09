import { type SessionResponse } from '../game/authoritative-session'
import { setWorkersAtHome } from '../../shared/domain/player'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'
import '../../shared/cards/A/A116_WoodCutter'
import '../../shared/cards/A/A002_ShiftingCultivation'

import { describe, expect, it } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { computePaymentOptionsForTest } from '../../shared/actions/payment/__tests__/test-helpers'
import type { PaymentSolution } from '../../shared/contract/types'
import '../../shared/cards/E/E060_WorkingGloves'

const CARD_ID = 'E060_WorkingGloves'

describe('E060_WorkingGloves session — trade-style modifier on occupation cost', () => {
  const setup = () => {
    const session = new GameSession(42)
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    state.currentPlayerIndex = 0
    state.round = 5
    const player = state.players[0]!
    player.minorPlayed.push(CARD_ID)
    player.resources = {
      ...player.resources,
      wood: 1,
      clay: 1,
      stone: 1,
      reed: 1,
      food: 4,
    }
    session.loadState(state)
    // After loadState normalizes, fetch the canonical player reference.
    const live = session.getState().state.players[0]!
    return { session, state, player: live }
  }

  const e60TradeTimes = (solution: PaymentSolution) =>
    solution.tradesUsed.reduce(
      (sum, entry) => sum + (entry.trade.sourceId === CARD_ID ? entry.times : 0),
      0,
    )

  it('player.activeModifiers contains 4 trade modifiers for occupation cost', () => {
    const { player } = setup()
    const e60Mods = player.activeModifiers.filter((m) => m.cardId === CARD_ID)
    expect(e60Mods.length).toBe(4)
    expect(e60Mods.every((m) => m.type === 'trade')).toBe(true)
    expect(e60Mods.every((m) => m.appliesTo.includes('occupation'))).toBe(true)
    const fromKeys = e60Mods.map((m) => m.type === 'trade' ? Object.keys(m.from)[0] : '').sort()
    expect(fromKeys).toEqual(['clay', 'reed', 'stone', 'wood'])
  })

  it('cost-pipeline emits ≥5 PaymentSolution paths (base + 4 trade alternatives)', () => {
    const { player } = setup()
    // Simulate playing an occupation with cost { food: 2 }.
    const solutions = computePaymentOptionsForTest(
      player,
      { fee: { food: 2 } },
      'occupation',
    )
    expect(solutions.length).toBeGreaterThanOrEqual(5)
    // Base solution: pay food:2.
    const base = solutions.find(
      (s) =>
        (s.resourcesPaid.food ?? 0) === 2 &&
        (s.resourcesPaid.wood ?? 0) === 0 &&
        (s.resourcesPaid.clay ?? 0) === 0 &&
        (s.resourcesPaid.stone ?? 0) === 0 &&
        (s.resourcesPaid.reed ?? 0) === 0,
    )
    expect(base).toBeDefined()
    // Each building resource trade alternative: pay 1 of that resource, 0 food.
    for (const res of ['wood', 'clay', 'stone', 'reed'] as const) {
      const tradeSol = solutions.find(
        (s) =>
          (s.resourcesPaid.food ?? 0) === 0 &&
          (s.resourcesPaid[res] ?? 0) === 1,
      )
      expect(tradeSol, `trade alt for ${res}`).toBeDefined()
    }
  })

  it('does not affect non-occupation cost types', () => {
    const { player } = setup()
    // Renovation cost: pay 2 clay + 1 reed. The 4 occupation trades must not
    // appear because their appliesTo doesn't include 'renovation'.
    const solutions = computePaymentOptionsForTest(
      player,
      { fee: { clay: 1, reed: 1 } },
      'renovation',
    )
    // All solutions should pay the literal cost (or be limited by what's
    // available). No solution should pay 0 clay + 0 reed via E60 trade.
    const e60TradeUsed = solutions.find((s) =>
      s.tradesUsed.some((t) => t.trade.sourceId === CARD_ID && t.times > 0),
    )
    expect(e60TradeUsed).toBeUndefined()
  })

  it('does not allow two building resources to replace 4 food in one occupation payment', () => {
    const { player } = setup()
    player.resources = {
      ...player.resources,
      wood: 1,
      clay: 1,
      reed: 0,
      stone: 0,
      food: 0,
    }

    const solutions = computePaymentOptionsForTest(
      player,
      { fee: { food: 4 } },
      'occupation',
    )

    expect(solutions).toEqual([])
  })

  it('allows one building resource replacement when the remaining food is paid', () => {
    const { player } = setup()
    player.resources = {
      ...player.resources,
      wood: 1,
      clay: 1,
      reed: 0,
      stone: 0,
      food: 2,
    }

    const solutions = computePaymentOptionsForTest(
      player,
      { fee: { food: 4 } },
      'occupation',
    )

    expect(solutions.length).toBeGreaterThan(0)
    expect(solutions.every((s) => e60TradeTimes(s) <= 1)).toBe(true)
    expect(solutions.some((s) => e60TradeTimes(s) === 1 && (s.resourcesPaid.food ?? 0) === 2)).toBe(true)
  })
})

describe('E060 Working Gloves parity', () => {
  const CARD_ID = 'E060_WorkingGloves'

  const OCCUPATION_ID = 'A116_WoodCutter'

  const FOOD_MINOR_ID = 'A002_ShiftingCultivation'

  const FILLER = '__test_placeholder__'

  const setup = ({
    played = true, playerCount = 3, resources = {},
  }: {
    played?: boolean
    playerCount?: number
    resources?: Partial<{ wood: number; clay: number; reed: number; stone: number; food: number }>
  } = {}) => {
    const session = new GameSession(6060, undefined, { playerCount })
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
      Object.assign(player.resources, {
        wood: 0, clay: 0, reed: 0, stone: 0, food: 20, grain: 0, vegetable: 0,
        sheep: 0, boar: 0, cattle: 0, begging: 0,
      })
    })
    const owner = state.players[0]!
    owner.minorHand = played ? [FILLER] : [CARD_ID]
    owner.minorPlayed = played ? [CARD_ID] : []
    owner.occupationHand = [OCCUPATION_ID]
    owner.resources.food = 0
    Object.assign(owner.resources, resources)
    session.loadState(state)
    return session
  }

  const options = (response: SessionResponse) => response.interaction.stateId === 'wait'
    ? response.interaction.request.options ?? []
    : []

  const playMinor = (session: GameSession, cardId = CARD_ID) => {
    let response = session.takeAction(0, 'meeting-place')
    if (response.interaction.stateId !== 'wait') return response
    if (!options(response).some((option) => option.value === cardId)) {
      const improvement = options(response).find((option) =>
        option.value.startsWith('action-improvement-'))
      if (improvement) {
        response = session.resolveChoice(response.interaction.playerIndex, improvement.value)
      }
    }
    if (response.interaction.stateId !== 'wait') return response
    const card = options(response).find((option) => option.value === cardId)
    if (card) response = session.resolveChoice(response.interaction.playerIndex, card.value)
    return response
  }

  const occupationPayment = (
    session: GameSession,
    choose: (resources: Record<string, number>) => boolean,
  ) => {
    let response = session.takeAction(0, 'lessons-3')
    expect(response.ok, response.error).toBe(true)
    if (response.interaction.stateId === 'wait') {
      const occupation = options(response).find((option) => option.value === OCCUPATION_ID)
      if (occupation) {
        response = session.resolveChoice(response.interaction.playerIndex, occupation.value)
      }
    }
    if (response.state.players[0]!.occupationPlayed.includes(OCCUPATION_ID)) return response
    expect(response.interaction).toMatchObject({
      stateId: 'wait', promptKey: 'prompt.selectPayment', request: { kind: 'choice' },
    })
    const payment = options(response).find((option) => {
      const paid = option.labelParams?.resourcesPaid as Record<string, number> | undefined
      return paid ? choose(paid) : false
    })
    expect(payment, JSON.stringify(response.interaction)).toBeDefined()
    response = session.resolveChoice(response.interaction.playerIndex, payment!.value)
    return response
  }

  it('E060 S1: playing Working Gloves gains one food', () => {
    const response = playMinor(setup({ played: false, playerCount: 2 }))

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.minorPlayed).toContain(CARD_ID)
    expect(response.state.players[0]!.resources.food).toBe(1)
  })

  it('E060 S2: one wood can replace the two-food occupation cost', () => {
    const session = setup({ resources: { wood: 1 } })

    const response = occupationPayment(session, (paid) => paid.wood === 1 && !paid.food)

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.occupationPlayed).toContain(OCCUPATION_ID)
    expect(response.state.players[0]!.resources).toMatchObject({ wood: 0, food: 0 })
  })

  it('E060 S3: the normal two-food occupation payment remains selectable', () => {
    const session = setup({ resources: { wood: 1, food: 2 } })

    const response = occupationPayment(session, (paid) => paid.food === 2 && !paid.wood)

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.occupationPlayed).toContain(OCCUPATION_ID)
    expect(response.state.players[0]!.resources).toMatchObject({ wood: 1, food: 0 })
  })

  it('E060 S4: Working Gloves does not replace a minor improvement food cost', () => {
    const session = setup({ playerCount: 2, resources: { wood: 1 } })
    const state = session.getState().state
    state.players[0]!.minorHand = [FOOD_MINOR_ID]
    session.loadState(state)

    const response = playMinor(session, FOOD_MINOR_ID)

    expect(response.state.players[0]!.minorHand).toContain(FOOD_MINOR_ID)
    expect(response.state.players[0]!.minorPlayed).not.toContain(FOOD_MINOR_ID)
    expect(response.state.players[0]!.resources.wood).toBe(1)
  })
})
