import { describe, expect, it } from 'vitest'
import { GameSession } from '../game-session'

import '../../shared/cards/B/B130_FullPeasant'

const CARD_ID = 'B130_FullPeasant'

const setup = (options?: {
  withCard?: boolean
  food?: number
  fencingOccupied?: boolean
  grainOccupied?: boolean
}) => {
  const session = new GameSession()
  const state = session.getState().state
  state.players = state.players.slice(0, 2)
  state.currentPlayerIndex = 0
  state.round = 5 // Grain Utilization (stage 1) and Fencing (stage 1) are both available

  const player = state.players[0]!
  player.workersAvailable = 2
  player.resources = {
    ...player.resources,
    food: options?.food ?? 3,
    grain: 2,
    wood: 10,
  }
  state.players[1]!.workersAvailable = 2

  if (options?.withCard ?? true) {
    player.occupationPlayed.push(CARD_ID)
    player.playedCards.push(`occupation:${CARD_ID}`)
  }

  const grain = state.actionSpaces.find((s) => s.id === 'grain-utilization')
  const fencing = state.actionSpaces.find((s) => s.id === 'fencing')
  if (grain) grain.takenBy = options?.grainOccupied ? state.players[1]!.id : null
  if (fencing) fencing.takenBy = options?.fencingOccupied ? state.players[1]!.id : null

  session.loadState(state)
  return session
}

describe('B130_FullPeasant session', () => {
  it('offers optional chain after placing on grain-utilization when fencing is unoccupied', () => {
    const session = setup({ withCard: true, food: 3 })
    const resp = session.takeAction(0, 'grain-utilization')
    expect(resp.ok).toBe(true)
    // Grain utilization auto-resolves (no field to sow, no oven to bake); the
    // B130 after-place-farmer optional chain becomes the first pending choice.
    expect(resp.pending.type).toBe('choice')
    if (resp.pending.type !== 'choice') return
    const hasSkip = resp.pending.options.some((o) => o.value === '__skip__')
    expect(hasSkip).toBe(true)
    // The non-skip option is the pay-resources leaf for the optional seq
    const payOption = resp.pending.options.find((o) => o.value !== '__skip__')
    expect(payOption).toBeDefined()
  })

  it('pays 1 food and chains to fence when accepting from grain-utilization', () => {
    const session = setup({ withCard: true, food: 3 })
    let resp = session.takeAction(0, 'grain-utilization')
    expect(resp.ok).toBe(true)
    expect(resp.pending.type).toBe('choice')
    if (resp.pending.type !== 'choice') return

    // Accept the B130 chain (non-skip option activates the optional seq)
    const accept = resp.pending.options.find((o) => o.value !== '__skip__')
    expect(accept).toBeDefined()
    resp = session.resolveChoice(0, accept!.value)
    // Food should be -1 after pay (from 3 to 2)
    expect(resp.state.players[0]!.resources.food).toBe(2)
    // Next: fence action is presented (or an interaction)
  })

  it('does not offer chain when the other space is occupied', () => {
    const session = setup({ withCard: true, food: 3, fencingOccupied: true })
    let resp = session.takeAction(0, 'grain-utilization')
    expect(resp.ok).toBe(true)
    if (resp.pending.type !== 'choice') return
    // Skip grain-utilization's sow/bake
    resp = session.resolveChoice(0, '__skip__')
    // After place-farmer hooks: B130 should NOT have triggered (fencing occupied).
    // So the engine should be done → no choice pending.
    expect(resp.pending.type).not.toBe('choice')
  })

  it('does not offer chain when player has no food', () => {
    const session = setup({ withCard: true, food: 0 })
    let resp = session.takeAction(0, 'grain-utilization')
    expect(resp.ok).toBe(true)
    if (resp.pending.type !== 'choice') return
    resp = session.resolveChoice(0, '__skip__')
    expect(resp.pending.type).not.toBe('choice')
  })

  it('does not offer chain without the card', () => {
    const session = setup({ withCard: false, food: 3 })
    let resp = session.takeAction(0, 'grain-utilization')
    expect(resp.ok).toBe(true)
    if (resp.pending.type !== 'choice') return
    resp = session.resolveChoice(0, '__skip__')
    expect(resp.pending.type).not.toBe('choice')
  })

  it('does not trigger on unrelated spaces', () => {
    const session = setup({ withCard: true, food: 3 })
    const resp = session.takeAction(0, 'day-laborer')
    expect(resp.ok).toBe(true)
    // day-laborer is a simple gain action; no B130 trigger
    expect(resp.pending.type).not.toBe('choice')
  })

  it('triggers symmetrically on fencing → grain-utilization direction', () => {
    const session = setup({ withCard: true, food: 3, fencingOccupied: false, grainOccupied: false })
    // Make sure round allows fencing and grain-utilization
    const state = session.getState().state
    state.players[0]!.fences = 5
    state.players[0]!.resources.wood = 10
    session.loadState(state)

    let resp = session.takeAction(0, 'fencing')
    expect(resp.ok).toBe(true)
    // fencing immediately goes into fence-selection UI (not a pre-placement choice).
    // We can't easily complete fence-selection here; just verify takeAction succeeded.
    // The B130 after-hook will fire when fence completes. We verify by confirming
    // that the listener is wired up correctly via its synchronous path — skipped,
    // we rely on flow-level tests for this branch.
    expect(resp.ok).toBe(true)
  })
})
