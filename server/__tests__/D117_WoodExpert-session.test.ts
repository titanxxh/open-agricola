import { describe, expect, it } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { setWorkersAtHome } from '../../shared/domain/player'
import '../../shared/cards/D/D117_WoodExpert'
import '../../shared/cards/B/B81_Handcart'
import '../../shared/cards/B/B43_Chophouse'

const CARD_ID = 'D117_WoodExpert'

const setup = (opts?: {
  food?: number
  wood?: number
  clay?: number
  minor?: string
}) => {
  const session = new GameSession(/* seed */ 1)
  const state = session.getState().state
  state.players = state.players.slice(0, 2)
  state.currentPlayerIndex = 0
  state.round = 5
  state.roundPhase = 'work'

  const player = state.players[0]!
  setWorkersAtHome(state, player, 2)
  player.resources = {
    ...player.resources,
    food: opts?.food ?? 10,
    wood: opts?.wood ?? 0,
    clay: opts?.clay ?? 0,
  }
  if (!player.occupationPlayed.includes(CARD_ID)) {
    player.occupationPlayed.push(CARD_ID)
  }
  if (opts?.minor && !player.minorHand.includes(opts.minor)) {
    player.minorHand.push(opts.minor)
  }
  state.players[1]!.workersAvailable = 2

  const majorImprovement = state.actionSpaces.find((space) => space.id === 'major-improvement')
  if (!majorImprovement) throw new Error('major-improvement missing')
  majorImprovement.takenBy = []

  session.loadState(state)
  return session
}

const chooseMinor = (
  session: GameSession,
  response: ReturnType<GameSession['takeAction']>,
  cardId: string,
) => {
  expect(response.interaction.stateId).toBe('wait')
  if (response.interaction.stateId !== 'wait') return response
  const option = response.interaction.options?.find((entry) => entry.value === `minor:${cardId}`)
  expect(option).toBeDefined()
  return session.resolveChoice(0, option!.value)
}

describe('D117_WoodExpert session — card-purchase cost candidates', () => {
  it('cost wood:1 minor + food=10 wood=2 → multi-solution choice', () => {
    const session = setup({ food: 10, wood: 2, minor: 'B81_Handcart' })
    let resp = session.takeAction(0, 'major-improvement')
    expect(resp.ok).toBe(true)
    if (resp.interaction.stateId !== 'wait') return
    resp = chooseMinor(session, resp, 'B81_Handcart')
    expect(resp.interaction.stateId).toBe('wait')
    if (resp.interaction.stateId !== 'wait') return
    expect(resp.interaction.promptKey).toBe('prompt.selectPayment')
    expect(resp.interaction.options?.length).toBeGreaterThanOrEqual(2)
  })

  it('cost wood minor + food=10 wood=0 → only trade affordable, auto-select', () => {
    const session = setup({ food: 10, wood: 0, minor: 'B81_Handcart' })
    let resp = session.takeAction(0, 'major-improvement')
    if (resp.interaction.stateId !== 'wait') return
    resp = chooseMinor(session, resp, 'B81_Handcart')
    expect(resp.interaction.stateId === 'wait' ? resp.interaction.request.kind : resp.interaction.stateId).toBe('confirm-next-player')
    expect(resp.state.players[0]!.resources.food).toBe(9) // -1 food (trade)
    expect(resp.state.players[0]!.resources.wood).toBe(0)
  })

  it('cost wood minor + food=0 wood=2 → only base affordable, auto-select', () => {
    const session = setup({ food: 0, wood: 2, minor: 'B81_Handcart' })
    let resp = session.takeAction(0, 'major-improvement')
    if (resp.interaction.stateId !== 'wait') return
    resp = chooseMinor(session, resp, 'B81_Handcart')
    expect(resp.interaction.stateId === 'wait' ? resp.interaction.request.kind : resp.interaction.stateId).toBe('confirm-next-player')
    expect(resp.state.players[0]!.resources.wood).toBe(1) // -1 wood
    expect(resp.state.players[0]!.resources.food).toBe(0)
  })

  it('cost wood:1 minor → D117 candidate + base wood=1 → both solutions affordable', () => {
    const session = setup({ food: 10, wood: 1, minor: 'B81_Handcart' })
    let resp = session.takeAction(0, 'major-improvement')
    if (resp.interaction.stateId !== 'wait') return
    resp = chooseMinor(session, resp, 'B81_Handcart')
    expect(resp.interaction.stateId).toBe('wait')
    if (resp.interaction.stateId !== 'wait') return
    expect(resp.interaction.options?.length).toBeGreaterThanOrEqual(2)
  })

  it('altCosts minor (B43 Chophouse altCosts:[{wood:2},{clay:2}]) → wood-base + D117 candidate + clay-base', () => {
    // D117 appends one candidate for the wood fee and leaves the clay fee alone.
    const session = setup({ food: 10, wood: 2, clay: 2, minor: 'B43_Chophouse' })
    let resp = session.takeAction(0, 'major-improvement')
    if (resp.interaction.stateId !== 'wait') return
    resp = chooseMinor(session, resp, 'B43_Chophouse')
    expect(resp.interaction.stateId).toBe('wait')
    if (resp.interaction.stateId !== 'wait') return
    expect(resp.interaction.promptKey).toBe('prompt.selectPayment')
    expect(resp.interaction.options?.length).toBeGreaterThanOrEqual(3)
    const getPaid = (o: typeof resp.interaction.options[number]) =>
      (o.labelParams as Record<string, unknown> | undefined)?.resourcesPaid as
        | Record<string, number>
        | undefined
    const woodBase = resp.interaction.options?.find((o) => {
      const paid = getPaid(o)
      return !!paid && (paid.wood ?? 0) === 2 && (paid.clay ?? 0) === 0 && (paid.food ?? 0) === 0
    })
    const woodTrade = resp.interaction.options?.find((o) => {
      const paid = getPaid(o)
      return !!paid && (paid.wood ?? 0) === 0 && (paid.clay ?? 0) === 0 && (paid.food ?? 0) === 1
    })
    const clayBase = resp.interaction.options?.find((o) => {
      const paid = getPaid(o)
      return !!paid && (paid.wood ?? 0) === 0 && (paid.clay ?? 0) === 2 && (paid.food ?? 0) === 0
    })
    expect(woodBase).toBeDefined()
    expect(woodTrade).toBeDefined()
    expect(clayBase).toBeDefined()
  })

  it('altCosts minor + food=10 wood=2 clay=0 → wood-base + D117 candidate (clay alt unaffordable)', () => {
    // food=10 wood=2 clay=0 — wood-base (wood:2) and D117 candidate (wood:0+food:1)
    // are affordable; clay-base alt (clay:2) is not.
    const session = setup({ food: 10, wood: 2, clay: 0, minor: 'B43_Chophouse' })
    let resp = session.takeAction(0, 'major-improvement')
    if (resp.interaction.stateId !== 'wait') return
    resp = chooseMinor(session, resp, 'B43_Chophouse')
    expect(resp.interaction.stateId).toBe('wait')
    if (resp.interaction.stateId !== 'wait') return
    expect(resp.interaction.options?.length).toBeGreaterThanOrEqual(2)
    const getPaid = (o: typeof resp.interaction.options[number]) =>
      (o.labelParams as Record<string, unknown> | undefined)?.resourcesPaid as
        | Record<string, number>
        | undefined
    const woodBase = resp.interaction.options?.find((o) => {
      const paid = getPaid(o)
      return !!paid && (paid.wood ?? 0) === 2 && (paid.clay ?? 0) === 0 && (paid.food ?? 0) === 0
    })
    const woodTrade = resp.interaction.options?.find((o) => {
      const paid = getPaid(o)
      return !!paid && (paid.wood ?? 0) === 0 && (paid.clay ?? 0) === 0 && (paid.food ?? 0) === 1
    })
    expect(woodBase).toBeDefined()
    expect(woodTrade).toBeDefined()
  })
})
