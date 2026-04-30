import { describe, expect, it } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { setWorkersAtHome } from '../../shared/game/player'
import '../../shared/cards/A/A4_Baseboards'

const CARD_ID = 'A4_Baseboards'

const setup = (opts?: { food?: number; grain?: number }) => {
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
    food: opts?.food ?? 2,
    grain: opts?.grain ?? 0,
  }
  if (!player.minorHand.includes(CARD_ID)) {
    player.minorHand.push(CARD_ID)
  }
  state.players[1]!.workersAvailable = 2

  const majorImprovement = state.actionSpaces.find((space) => space.id === 'major-improvement')
  if (!majorImprovement) throw new Error('major-improvement missing')
  majorImprovement.takenBy = []

  session.loadState(state)
  return session
}

describe('A4_Baseboards session — altCosts', () => {
  it('food=2, grain=0 → auto-pay food (single solution, no choice prompt)', () => {
    const session = setup({ food: 2, grain: 0 })
    let resp = session.takeAction(0, 'major-improvement')
    expect(resp.ok).toBe(true)
    expect(resp.pending.type).toBe('choice')
    if (resp.pending.type !== 'choice') return
    resp = session.resolveChoice(0, `minor:${CARD_ID}`)
    expect(resp.ok).toBe(true)
    expect(resp.pending.type).toBe('confirmNextPlayer')
    expect(resp.state.players[0]!.resources.food).toBe(0)
    expect(resp.state.players[0]!.resources.grain).toBe(0)
  })

  it('food=0, grain=1 → auto-pay grain (single solution)', () => {
    const session = setup({ food: 0, grain: 1 })
    let resp = session.takeAction(0, 'major-improvement')
    expect(resp.ok).toBe(true)
    if (resp.pending.type !== 'choice') return
    resp = session.resolveChoice(0, `minor:${CARD_ID}`)
    expect(resp.pending.type).toBe('confirmNextPlayer')
    expect(resp.state.players[0]!.resources.food).toBe(0)
    expect(resp.state.players[0]!.resources.grain).toBe(0)
  })

  it('food=2, grain=1 → multi-solution → selectPayment choice', () => {
    const session = setup({ food: 2, grain: 1 })
    let resp = session.takeAction(0, 'major-improvement')
    if (resp.pending.type !== 'choice') return
    resp = session.resolveChoice(0, `minor:${CARD_ID}`)
    expect(resp.pending.type).toBe('choice')
    if (resp.pending.type !== 'choice') return
    expect(resp.pending.promptKey).toBe('prompt.selectPayment')
    expect(resp.pending.options.length).toBeGreaterThanOrEqual(2)

    const grainOption = resp.pending.options.find((o) => {
      const params = o.labelParams as Record<string, unknown> | undefined
      const paid = params?.resourcesPaid as Record<string, number> | undefined
      return !!paid && (paid.grain ?? 0) === 1 && !paid.food
    })
    expect(grainOption).toBeDefined()
    resp = session.resolveChoice(0, grainOption!.value)
    expect(resp.pending.type).toBe('confirmNextPlayer')
    expect(resp.state.players[0]!.resources.grain).toBe(0)
    expect(resp.state.players[0]!.resources.food).toBe(2)
  })

  it('food=1, grain=0 → not buyable (cannot afford either alt)', () => {
    const session = setup({ food: 1, grain: 0 })
    const resp = session.takeAction(0, 'major-improvement')
    expect(resp.pending.type).toBe('choice')
    if (resp.pending.type !== 'choice') return
    const a4Option = resp.pending.options.find((o) => o.value === `minor:${CARD_ID}`)
    expect(a4Option).toBeUndefined()
  })
})
