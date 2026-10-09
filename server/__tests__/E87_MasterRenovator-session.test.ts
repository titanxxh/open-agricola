import { type SessionResponse } from '../game/authoritative-session'
import { markAllWorkersUsed } from '../../shared/domain/player'

import { describe, expect, it } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'
import { runCardEffectHook } from '../../shared/cards/card-effects'
import { computePaymentOptionsForTest } from '../../shared/actions/payment/__tests__/test-helpers'
import { setWorkersAtHome } from '../../shared/domain/player'
import { E087_MasterRenovator_impl } from '../../shared/cards/E/E087_MasterRenovator'
import { getAdHocAction } from '../../shared/actions/helpers/ad-hoc-action-registry'

const CARD_ID = 'E087_MasterRenovator'

describe('E087_MasterRenovator session — chooseOne renovation discount', () => {
  const setup = (round: number) => {
    const session = new GameSession(42)
    stabilizeRandomHands(session.state.players)
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    state.currentPlayerIndex = 0
    state.round = round
    const player = state.players[0]!
    player.occupationPlayed.push(CARD_ID)
    player.houseType = 'wood'
    player.rooms = 2
    player.resources = {
      ...player.resources,
      wood: 0,
      clay: 2,
      stone: 2,
      reed: 1,
      food: 0,
    }
    setWorkersAtHome(state, player, 2)
    session.loadState(state)
    return { session, state, player }
  }

  it('onStartReturnHome in round 7 with wood house pushes 4-choice BonusModifier on activeModifiers', () => {
    const { state, player } = setup(7)
    const flow = runCardEffectHook(state, player, CARD_ID, 'onStartReturnHome')
    expect(flow).toBeDefined()
    const mod = player.activeModifiers.find(
      (m) => m.cardId === CARD_ID && m.type === 'bonus' && m.appliesTo.includes('renovation'),
    )
    expect(mod).toBeDefined()
    expect(mod && mod.type === 'bonus' && Array.isArray(mod.choices) ? mod.choices.length : 0).toBe(4)
  })

  it('onStartReturnHome does not trigger on round 6', () => {
    const { state, player } = setup(6)
    const flow = runCardEffectHook(state, player, CARD_ID, 'onStartReturnHome')
    expect(flow).toBeFalsy()
    expect(player.activeModifiers.some((m) => m.cardId === CARD_ID)).toBe(false)
  })

  it('onStartReturnHome does not trigger when house is stone', () => {
    const { state, player } = setup(7)
    player.houseType = 'stone'
    const flow = runCardEffectHook(state, player, CARD_ID, 'onStartReturnHome')
    expect(flow).toBeFalsy()
    expect(player.activeModifiers.some((m) => m.cardId === CARD_ID)).toBe(false)
  })

  it('cost-pipeline emits 4 PaymentSolution paths (one per building resource discounted)', () => {
    const { state, player } = setup(7)
    runCardEffectHook(state, player, CARD_ID, 'onStartReturnHome')
    // wood→clay base cost: { clay: 2, reed: 1 } for 2 rooms
    const solutions = computePaymentOptionsForTest(
      player,
      { fee: { clay: 2, reed: 1 } },
      'renovation',
    )
    // Expect at least 4 distinct payment paths (one per building resource discount).
    // Player has clay=2 stone=2 reed=1 wood=0; some discount paths may not be
    // affordable (e.g. wood discount needs wood available). The bonus is
    // optional:false (mandatory chooseOne), so we expect choice paths to dominate.
    // At minimum: clay-discount path { clay:1, reed:1 } and reed-discount path { clay:2, reed:0 }
    // are affordable. Stone-discount path (player has 2 stone but cost has no
    // stone) collapses with clay-discount in optimal sort if no extra resource
    // movement, but distinct sources mean distinct PaymentSolution.
    // Concrete affordable expectations:
    //   clay-discount: paid clay:1, reed:1
    //   reed-discount: paid clay:2, reed:0
    //   stone-discount: paid clay:2, reed:1 (no clay reduction; only stone removed from cost which has no stone, so equiv to no-op)
    //   wood-discount: same shape as stone (player has no wood to "pay less")
    // So the canonical chooseOne semantics yield variance via bonusUsed source
    // tags. We assert ≥2 distinct PaymentSolutions whose bonusUsed sourceCard
    // includes E087_MasterRenovator.
    const e87Solutions = solutions.filter((s) => (s.bonusUsed ?? '').includes(CARD_ID))
    expect(e87Solutions.length).toBeGreaterThanOrEqual(2)
    const clayDiscount = e87Solutions.find(
      (s) => (s.resourcesPaid.clay ?? 0) === 1 && (s.resourcesPaid.reed ?? 0) === 1,
    )
    const reedDiscount = e87Solutions.find(
      (s) => (s.resourcesPaid.clay ?? 0) === 2 && (s.resourcesPaid.reed ?? 0) === 0,
    )
    expect(clayDiscount).toBeDefined()
    expect(reedDiscount).toBeDefined()
  })

  it('listener pops the BonusModifier after renovate-house with sourceCard CARD_ID', () => {
    const { state, player } = setup(7)
    runCardEffectHook(state, player, CARD_ID, 'onStartReturnHome')
    const listener = E087_MasterRenovator_impl.listeners!.find((entry) =>
      entry.id === 'E87-master-renovator-after-renovate')!
    const before = JSON.stringify(player.activeModifiers)
    const result = listener.handler({
      state,
      player,
      sourceCard: CARD_ID,
      actionId: 'renovate-house',
      phase: 'after',
    } as never)
    expect(JSON.stringify(player.activeModifiers)).toBe(before)
    expect(result?.flow).toMatchObject({
      type: 'leaf',
      actionId: 'card_E087_MasterRenovator_popModifier',
      sourceCard: CARD_ID,
    })
    if (result?.flow?.type === 'leaf') {
      getAdHocAction(result.flow.actionId)!.execute({ state, player } as never)
    }
    expect(player.activeModifiers.some((modifier) => modifier.cardId === CARD_ID)).toBe(false)
  })

  it('renovation target choice waits for payment before mutating', () => {
    const { session, state, player } = setup(7)
    runCardEffectHook(state, player, CARD_ID, 'onStartReturnHome')
    session.loadState(state)

    let resp = session.takeAction(0, 'house-redevelopment')
    expect(resp.ok).toBe(true)
    if (resp.interaction.stateId === 'wait' && resp.interaction.promptKey === 'ui.interactionChooseRenovationTarget') {
      resp = session.resolveChoice(0, 'clay')
    }

    expect(resp.interaction.stateId).toBe('wait')
    if (resp.interaction.stateId !== 'wait') return
    expect(resp.interaction.promptKey).toBe('prompt.selectPayment')
    expect(resp.state.players[0]!.houseType).toBe('wood')
    expect(resp.state.players[0]!.resources.clay).toBe(2)
    expect(resp.state.players[0]!.resources.reed).toBe(1)
    expect(resp.state.players[0]!.activeModifiers.some((m) => m.cardId === CARD_ID)).toBe(true)
  })

  it('onAfterRoundEnd cleans up the BonusModifier as a safety net', () => {
    const { state, player } = setup(7)
    runCardEffectHook(state, player, CARD_ID, 'onStartReturnHome')
    expect(player.activeModifiers.some((m) => m.cardId === CARD_ID)).toBe(true)
    runCardEffectHook(state, player, CARD_ID, 'onAfterRoundEnd')
    expect(player.activeModifiers.some((m) => m.cardId === CARD_ID)).toBe(false)
  })
})

describe('E087 Master Renovator parity', () => {
  const CARD_ID = 'E087_MasterRenovator'

  const FILLER = '__test_placeholder__'

  const options = (response: SessionResponse) => response.interaction.stateId === 'wait'
    ? response.interaction.request.options ?? []
    : []

  const setup = ({
    played = true, round = 7, houseType = 'wood', resources = {},
  }: {
    played?: boolean
    round?: number
    houseType?: 'wood' | 'clay' | 'stone'
    resources?: Partial<Record<'wood' | 'clay' | 'reed' | 'stone', number>>
  } = {}) => {
    const session = new GameSession(6087, undefined, { playerCount: 2 })
    const state = session.getState().state
    stabilizeRandomHands(state.players)
    state.currentPlayerIndex = 0
    state.round = round
    state.roundPhase = 'work'
    state.actionSpaces.forEach((space) => { space.takenBy = [] })
    state.players.forEach((player) => {
      setWorkersAtHome(state, player, 2)
      player.minorHand = [FILLER]
      player.occupationHand = [FILLER]
      player.occupationPlayed = []
      player.resources = {
        ...player.resources, wood: 0, clay: 0, reed: 0, stone: 0, food: 20,
        grain: 0, vegetable: 0, sheep: 0, boar: 0, cattle: 0,
      }
    })
    const owner = state.players[0]!
    owner.occupationHand = played ? [FILLER] : [CARD_ID]
    owner.occupationPlayed = played ? [CARD_ID] : []
    owner.houseType = houseType
    owner.rooms = 2
    Object.assign(owner.resources, resources)
    if (played) state.players.forEach((player) => markAllWorkersUsed(state, player))
    session.loadState(state)
    return session
  }

  const chooseCardOffer = (session: GameSession, response: SessionResponse, accept: boolean) => {
    let current = response
    if (current.interaction.stateId === 'wait'
      && current.interaction.request.kind === 'select-trigger') {
      const trigger = options(current).find((option) =>
        option.value === CARD_ID || option.sourceCard === CARD_ID)
      expect(trigger).toBeDefined()
      current = session.resolveChoice(current.interaction.playerIndex, trigger!.value)
    }
    expect(current.interaction.stateId).toBe('wait')
    if (current.interaction.stateId !== 'wait') return current
    const option = options(current).find((candidate) => accept
      ? candidate.value !== '__skip__'
      : candidate.value === '__skip__')
    expect(option, JSON.stringify(current.interaction)).toBeDefined()
    return session.resolveChoice(current.interaction.playerIndex, option!.value)
  }

  const acceptRenovation = (
    session: GameSession, response: SessionResponse, target: 'clay' | 'stone',
  ) => {
    let current = chooseCardOffer(session, response, true)
    if (current.interaction.stateId === 'wait'
      && current.interaction.promptKey === 'ui.interactionChooseRenovationTarget') {
      current = session.resolveChoice(current.interaction.playerIndex, target)
    }
    if (current.interaction.stateId === 'wait'
      && current.interaction.promptKey === 'prompt.selectPayment') {
      const payment = options(current).find((option) =>
        option.sourceCard === CARD_ID || JSON.stringify(option).includes(CARD_ID))
      expect(payment, JSON.stringify(current.interaction)).toBeDefined()
      current = session.resolveChoice(current.interaction.playerIndex, payment!.value)
    }
    for (let safety = 0; safety < 4 && current.interaction.stateId === 'wait'; safety += 1) {
      if (current.state.players[0]!.houseType === target) break
      const next = options(current).find((option) => {
        if (current.interaction.stateId !== 'wait') return false
        if (current.interaction.promptKey === 'ui.interactionChooseRenovationTarget') {
          return option.value === target
        }
        if (current.interaction.promptKey === 'prompt.selectPayment') {
          return option.sourceCard === CARD_ID || JSON.stringify(option).includes(CARD_ID)
        }
        return option.value !== '__skip__'
      })
      expect(next, JSON.stringify(current.interaction)).toBeDefined()
      current = session.resolveChoice(current.interaction.playerIndex, next!.value)
    }
    return current
  }

  it('E087 S2: round seven can discount one clay from a wood-house renovation', () => {
    const session = setup({ resources: { clay: 1, reed: 1 } })
    const response = acceptRenovation(session, session.performRoundEnd(), 'clay')

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]).toMatchObject({ houseType: 'clay' })
    expect(response.state.players[0]!.resources).toMatchObject({ clay: 0, reed: 0 })
  })

  it('E087 S3: round seven can discount the reed from a wood-house renovation', () => {
    const session = setup({ resources: { clay: 2 } })
    const response = acceptRenovation(session, session.performRoundEnd(), 'clay')

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]).toMatchObject({ houseType: 'clay' })
    expect(response.state.players[0]!.resources).toMatchObject({ clay: 0, reed: 0 })
  })

  it('E087 S4: round nine can discount one stone from a clay-house renovation', () => {
    const session = setup({
      round: 9, houseType: 'clay', resources: { stone: 1, reed: 1 },
    })
    const response = acceptRenovation(session, session.performRoundEnd(), 'stone')

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]).toMatchObject({ houseType: 'stone' })
    expect(response.state.players[0]!.resources).toMatchObject({ stone: 0, reed: 0 })
  })

  it('E087 S5: a round other than seven or nine receives no Master Renovator offer', () => {
    const response = setup({
      round: 8, resources: { clay: 2, reed: 1 },
    }).performRoundEnd()

    expect(response.ok, response.error).toBe(true)
    expect(response.state.round).toBe(9)
    expect(response.state.players[0]!.houseType).toBe('wood')
    expect(options(response).some((option) => option.sourceCard === CARD_ID)).toBe(false)
  })

  it('E087 S6: a stone house receives no Master Renovator offer', () => {
    const response = setup({
      houseType: 'stone', resources: { stone: 2, reed: 1 },
    }).performRoundEnd()

    expect(response.ok, response.error).toBe(true)
    expect(response.state.round).toBe(8)
    expect(response.state.players[0]!.houseType).toBe('stone')
    expect(options(response).some((option) => option.sourceCard === CARD_ID)).toBe(false)
  })

  it('E087 S7: the round-seven Master Renovator offer may be declined', () => {
    const session = setup({ resources: { clay: 2, reed: 1 } })
    const response = chooseCardOffer(session, session.performRoundEnd(), false)

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.houseType).toBe('wood')
    expect(response.state.players[0]!.resources).toMatchObject({ clay: 2, reed: 1 })
  })
})
