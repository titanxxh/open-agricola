import type { ActionChoiceOption } from '../../shared/contract/types'
import { type SessionResponse } from '../game/authoritative-session'
import { setWorkersAtHome } from '../../shared/domain/player'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'
import '../../shared/cards/A/A116_WoodCutter'
import '../../shared/cards/A/A002_ShiftingCultivation'

import { afterEach, describe, expect, it } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { PaymentSolver } from '../../shared/actions/payment'
import { createWorkSession } from './_helpers/session-fixtures'
import '../../shared/cards/E/E060_WorkingGloves'

const CARD_ID = 'E060_WorkingGloves'

const sessions: GameSession[] = []
afterEach(() => sessions.splice(0).forEach(session => session.dispose()))

// Public cost previews cover fees not offered by an ordinary Lessons action;
// committed payment and action admission are covered by Session tests below.
describe('E060 Working Gloves cost candidates', () => {
  const setup = (food = 4) => {
    const session = createWorkSession({ configure(state) {
      const owner = state.players[0]!
      owner.minorPlayed = [CARD_ID]
      Object.assign(owner.resources, { wood: 1, clay: 1, reed: 1, stone: 1, food })
    } })
    sessions.push(session)
    return session.getState().state
  }

  const options = (foodFee: number, availableFood = 4) => {
    const state = setup(availableFood)
    const resolved = PaymentSolver.resolveCardPreviewCostDetailedByProvider(
      state, state.players[0]!, 'occupation', 'A116_WoodCutter', () => ({ food: foodFee }), 'lessons',
    )
    if (!resolved) throw new Error('Expected an occupation cost')
    const cost = PaymentSolver.isComplexCost(resolved.cost) ? resolved.cost : { fee: resolved.cost }
    const context = { actionId: 'occupation', costType: 'occupation' as const,
      candidateMetadataByFeeIndex: resolved.candidateMetadataByFeeIndex }
    return { solutions: PaymentSolver.computeOptions(state, 0, cost, context),
      previews: PaymentSolver.describeOptions(state, 0, cost, context) }
  }

  it.each([[1, 0], [2, 0], [3, 1], [4, 2]])('fee %i substitutes at most two food, leaving %i food payable', (fee, remainder) => {
    const { solutions } = options(fee)
    expect(solutions.some(solution => solution.resourcesPaid.food === fee)).toBe(true)
    for (const material of ['wood', 'clay', 'reed', 'stone'] as const) {
      expect(solutions.some(solution => solution.resourcesPaid[material] === 1 &&
        (solution.resourcesPaid.food ?? 0) === remainder)).toBe(true)
    }
  })

  it('offers a free fee without charging a material', () => {
    const { solutions } = options(0, 0)
    expect(solutions).toHaveLength(1)
    expect(Object.values(solutions[0]!.resourcesPaid).every(amount => amount === 0)).toBe(true)
  })

  it('does not substitute twice for a four-food fee', () => {
    expect(options(4, 0).solutions).toEqual([])
  })

  it('combines a single substitution with Forest School for the remaining food', () => {
    const state = setup(0)
    const owner = state.players[0]!
    owner.minorPlayed.push('A028_ForestSchool')
    Object.assign(owner.resources, { wood: 2, clay: 1 })
    // Reload derives the other card's ordinary occupation payment modifier.
    const session = sessions.at(-1)!
    session.loadState(state)
    const live = session.getState().state
    const resolved = PaymentSolver.resolveCardPreviewCostDetailedByProvider(live, live.players[0]!, 'occupation', 'A116_WoodCutter', () => ({ food: 4 }))
    if (!resolved) throw new Error('Expected cost candidates')
    const previews = PaymentSolver.describeOptions(live, 0, resolved.cost, {
      actionId: 'occupation', costType: 'occupation', candidateMetadataByFeeIndex: resolved.candidateMetadataByFeeIndex,
    })
    expect(previews.some(preview => preview.effectPreview?.kind === 'payment' &&
      preview.effectPreview.resourcesPaid?.clay === 1 && preview.effectPreview.resourcesPaid.wood === 2 &&
      preview.effectPreview.sourceCards?.includes(CARD_ID) && preview.effectPreview.sourceCards.includes('A028_ForestSchool'))).toBe(true)
  })

  it('attributes only material candidate previews to Working Gloves', () => {
    const { previews } = options(1)
    const paid = previews.map(preview => preview.effectPreview)
    const material = paid.find(preview => preview?.kind === 'payment' && preview.resourcesPaid?.wood === 1)
    const ordinary = paid.find(preview => preview?.kind === 'payment' && preview.resourcesPaid?.food === 1)
    expect(material).toMatchObject({ kind: 'payment', resourcesPaid: { wood: 1 }, sourceCards: [CARD_ID] })
    expect(ordinary).toMatchObject({ kind: 'payment', resourcesPaid: { food: 1 } })
    if (!ordinary || ordinary.kind !== 'payment') throw new Error('Expected ordinary payment preview')
    expect(ordinary.sourceCards ?? []).toEqual([])
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
    sessions.push(session)
    return session
  }

  const options = (response: SessionResponse): ActionChoiceOption[] => response.interaction.stateId === 'wait' && 'options' in response.interaction.request
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
    choose: (resources: Partial<Record<string, number>>) => boolean,
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
      const preview = option.effectPreview
      return preview?.kind === 'payment' && preview.resourcesPaid ? choose(preview.resourcesPaid) : false
    })
    expect(payment, JSON.stringify(response.interaction)).toBeDefined()
    if (response.interaction.stateId !== 'wait') throw new Error('Expected payment choice')
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
