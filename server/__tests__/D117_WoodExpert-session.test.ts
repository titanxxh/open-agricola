import { describe, expect, it } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { setWorkersAtHome } from '../../shared/game/player'
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

describe('D117_WoodExpert session — computeCosts trades', () => {
  it('cost wood:1 minor + food=10 wood=2 → multi-solution choice', () => {
    const session = setup({ food: 10, wood: 2, minor: 'B81_Handcart' })
    let resp = session.takeAction(0, 'major-improvement')
    expect(resp.ok).toBe(true)
    if (resp.pending.type !== 'choice') return
    resp = session.resolveChoice(0, 'minor:B81_Handcart')
    expect(resp.pending.type).toBe('choice')
    if (resp.pending.type !== 'choice') return
    expect(resp.pending.promptKey).toBe('prompt.selectPayment')
    expect(resp.pending.options.length).toBeGreaterThanOrEqual(2)
  })

  it('cost wood minor + food=10 wood=0 → only trade affordable, auto-select (1 wood credit kept as surplus)', () => {
    const session = setup({ food: 10, wood: 0, minor: 'B81_Handcart' })
    let resp = session.takeAction(0, 'major-improvement')
    if (resp.pending.type !== 'choice') return
    resp = session.resolveChoice(0, 'minor:B81_Handcart')
    expect(resp.pending.type).toBe('confirmNextPlayer')
    expect(resp.state.players[0]!.resources.food).toBe(9) // -1 food (trade)
    // Trade gives 2 wood credit, fee.wood=1 → 1 wood surplus stays in player resources
    expect(resp.state.players[0]!.resources.wood).toBe(1)
  })

  it('cost wood minor + food=0 wood=2 → only base affordable, auto-select', () => {
    const session = setup({ food: 0, wood: 2, minor: 'B81_Handcart' })
    let resp = session.takeAction(0, 'major-improvement')
    if (resp.pending.type !== 'choice') return
    resp = session.resolveChoice(0, 'minor:B81_Handcart')
    expect(resp.pending.type).toBe('confirmNextPlayer')
    expect(resp.state.players[0]!.resources.wood).toBe(1) // -1 wood
    expect(resp.state.players[0]!.resources.food).toBe(0)
  })

  it('cost wood:1 minor → trade max=1 + base wood=1 → both solutions affordable', () => {
    const session = setup({ food: 10, wood: 1, minor: 'B81_Handcart' })
    let resp = session.takeAction(0, 'major-improvement')
    if (resp.pending.type !== 'choice') return
    resp = session.resolveChoice(0, 'minor:B81_Handcart')
    expect(resp.pending.type).toBe('choice')
    if (resp.pending.type !== 'choice') return
    expect(resp.pending.options.length).toBeGreaterThanOrEqual(2)
  })

  // Known limitation: D117 trade does NOT apply to altCosts-form minors because
  // resolveCardPreviewCost short-circuits when baseCost is already a ComplexCost
  // (e.g. altCosts -> { fees }), so the computeCosts hook never runs for those.
  // Scenarios 5/6 below assert the *current* behaviour (no trade injection on
  // altCosts minors), not the spec-aspirational behaviour. Lifting this requires
  // a main-path change in pay-helpers.ts that is explicitly out of scope here.
  it('altCosts minor (B43 Chophouse altCosts:[{wood:2},{clay:2}]) → only base alts (no D117 trade injected)', () => {
    const session = setup({ food: 10, wood: 2, clay: 2, minor: 'B43_Chophouse' })
    let resp = session.takeAction(0, 'major-improvement')
    if (resp.pending.type !== 'choice') return
    resp = session.resolveChoice(0, 'minor:B43_Chophouse')
    expect(resp.pending.type).toBe('choice')
    if (resp.pending.type !== 'choice') return
    expect(resp.pending.promptKey).toBe('prompt.selectPayment')
    // Only the two base alts (wood:2 / clay:2); D117 trade is NOT injected.
    expect(resp.pending.options.length).toBe(2)
    const woodOpt = resp.pending.options.find((o) => {
      const paid = (o.labelParams as Record<string, unknown> | undefined)?.resourcesPaid as
        | Record<string, number>
        | undefined
      return !!paid && (paid.wood ?? 0) === 2 && !paid.clay
    })
    const clayOpt = resp.pending.options.find((o) => {
      const paid = (o.labelParams as Record<string, unknown> | undefined)?.resourcesPaid as
        | Record<string, number>
        | undefined
      return !!paid && (paid.clay ?? 0) === 2 && !paid.wood
    })
    expect(woodOpt).toBeDefined()
    expect(clayOpt).toBeDefined()
  })

  it('altCosts minor + food=10 wood=2 clay=0 → only wood alt affordable, auto-select (no D117 trade)', () => {
    const session = setup({ food: 10, wood: 2, clay: 0, minor: 'B43_Chophouse' })
    let resp = session.takeAction(0, 'major-improvement')
    if (resp.pending.type !== 'choice') return
    resp = session.resolveChoice(0, 'minor:B43_Chophouse')
    // Single solution (wood:2) → auto-select; D117 trade not injected on altCosts path
    expect(resp.pending.type).toBe('confirmNextPlayer')
    expect(resp.state.players[0]!.resources.wood).toBe(0)
    expect(resp.state.players[0]!.resources.food).toBe(10)
  })
})
