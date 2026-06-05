import { describe, expect, it } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { setWorkersAtHome } from '../../shared/domain/player'
import '../../shared/cards/D/D117_WoodExpert'
import '../../shared/cards/B/B81_Handcart'
import '../../shared/cards/B/B43_Chophouse'

const CARD_ID = 'D117_WoodExpert'

type PaymentLabel = {
  resourcesPaid?: Record<string, number>
  sourceCards?: string[]
}

const setup = (opts?: {
  food?: number
  wood?: number
  clay?: number
  stone?: number
  reed?: number
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
    stone: opts?.stone ?? 0,
    reed: opts?.reed ?? 0,
  }
  if (!player.occupationPlayed.includes(CARD_ID)) {
    player.occupationPlayed.push(CARD_ID)
  }
  player.minorHand = [opts?.minor ?? '__test_placeholder__']
  player.occupationHand = ['__test_placeholder__']
  state.players[1]!.minorHand = ['__test_placeholder__']
  state.players[1]!.occupationHand = ['__test_placeholder__']
  state.players[1]!.workersAvailable = 2

  const majorImprovement = state.actionSpaces.find((space) => space.id === 'major-improvement')
  if (!majorImprovement) throw new Error('major-improvement missing')
  majorImprovement.takenBy = []

  session.loadState(state)
  return session
}

const chooseImprovement = (
  session: GameSession,
  response: ReturnType<GameSession['takeAction']>,
  value: string,
) => {
  expect(response.interaction.stateId).toBe('wait')
  if (response.interaction.stateId !== 'wait') return response
  if (response.interaction.request.kind === 'confirm-next-player') return response
  if (response.interaction.promptKey === 'prompt.selectPayment') return response
  const option = response.interaction.options?.find((entry) => entry.value === value)
  expect(option).toBeDefined()
  return session.resolveChoice(0, option!.value)
}

const chooseMinor = (
  session: GameSession,
  response: ReturnType<GameSession['takeAction']>,
  cardId: string,
) => chooseImprovement(session, response, `minor:${cardId}`)

const paymentLabels = (response: ReturnType<GameSession['takeAction']>) => {
  expect(response.interaction.stateId).toBe('wait')
  if (response.interaction.stateId !== 'wait') return []
  expect(response.interaction.promptKey).toBe('prompt.selectPayment')
  return (response.interaction.options ?? []).map((option) => ({
    value: option.value,
    label: option.labelParams as PaymentLabel | undefined,
  }))
}

const hasPaid = (
  label: PaymentLabel | undefined,
  expected: Record<string, number>,
) => !!label?.resourcesPaid && Object.entries(expected).every(
  ([key, value]) => (label.resourcesPaid?.[key] ?? 0) === value,
)

describe('D117_WoodExpert session — candidate cost derivation', () => {
  it('major wood cost preserves original candidate and offers derived candidate with source', () => {
    const session = setup({ food: 10, wood: 2, stone: 2 })
    let resp = session.takeAction(0, 'major-improvement')
    resp = chooseImprovement(session, resp, 'major:Major_Joinery')
    const labels = paymentLabels(resp)
    const original = labels.find(({ label }) => hasPaid(label, { wood: 2, stone: 2, food: 0 }))
    const derived = labels.find(({ label }) => hasPaid(label, { wood: 0, stone: 2, food: 1 }))
    expect(original).toBeDefined()
    expect(derived).toBeDefined()
    expect(original?.label?.sourceCards ?? []).toEqual([])
    expect(derived?.label?.sourceCards).toContain(CARD_ID)
    expect(derived?.value).toMatch(/^pay:/)
  })

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

  it('cost wood:1 minor → trade max=1 + base wood=1 → both solutions affordable', () => {
    const session = setup({ food: 10, wood: 1, minor: 'B81_Handcart' })
    let resp = session.takeAction(0, 'major-improvement')
    if (resp.interaction.stateId !== 'wait') return
    resp = chooseMinor(session, resp, 'B81_Handcart')
    expect(resp.interaction.stateId).toBe('wait')
    if (resp.interaction.stateId !== 'wait') return
    expect(resp.interaction.options?.length).toBeGreaterThanOrEqual(2)
  })

  it('altCosts minor (B43 Chophouse altCosts:[{wood:2},{clay:2}]) → wood-base + wood-trade + clay-base', () => {
    const session = setup({ food: 10, wood: 2, clay: 2, minor: 'B43_Chophouse' })
    let resp = session.takeAction(0, 'major-improvement')
    if (resp.interaction.stateId !== 'wait') return
    resp = chooseMinor(session, resp, 'B43_Chophouse')
    const labels = paymentLabels(resp)
    expect(labels.length).toBeGreaterThanOrEqual(3)
    const woodBase = labels.find(({ label }) => hasPaid(label, { wood: 2, clay: 0, food: 0 }))
    const woodDerived = labels.find(({ label }) => hasPaid(label, { wood: 0, clay: 0, food: 1 }))
    const clayBase = labels.find(({ label }) => hasPaid(label, { wood: 0, clay: 2, food: 0 }))
    expect(woodBase).toBeDefined()
    expect(woodDerived).toBeDefined()
    expect(clayBase).toBeDefined()
    expect(woodBase?.label?.sourceCards ?? []).toEqual([])
    expect(woodDerived?.label?.sourceCards).toContain(CARD_ID)
    expect(clayBase?.label?.sourceCards ?? []).toEqual([])
  })

  it('altCosts minor + food=10 wood=2 clay=0 → wood-base + wood-trade (clay alt unaffordable)', () => {
    const session = setup({ food: 10, wood: 2, clay: 0, minor: 'B43_Chophouse' })
    let resp = session.takeAction(0, 'major-improvement')
    if (resp.interaction.stateId !== 'wait') return
    resp = chooseMinor(session, resp, 'B43_Chophouse')
    const labels = paymentLabels(resp)
    expect(labels.length).toBeGreaterThanOrEqual(2)
    const woodBase = labels.find(({ label }) => hasPaid(label, { wood: 2, clay: 0, food: 0 }))
    const woodDerived = labels.find(({ label }) => hasPaid(label, { wood: 0, clay: 0, food: 1 }))
    expect(woodBase).toBeDefined()
    expect(woodDerived).toBeDefined()
  })
})
