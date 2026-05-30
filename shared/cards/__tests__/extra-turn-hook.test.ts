import { describe, it, expect } from 'vitest'
import { GameSession } from '../../../server/game/authoritative-session'
import { setActiveWorkerCount, setWorkersAtHome } from '../../domain/player'
import { hasPendingExtraTurn, collectExtraTurnFlow } from '../card-effects'
import { A92_AdoptiveParents } from '../../cards-display/A/A92_AdoptiveParents'
import '../A/A92_AdoptiveParents'

const A92 = A92_AdoptiveParents.id

const placeholderHands = (state: {
  players: { minorHand: string[]; occupationHand: string[] }[]
}) => {
  for (const p of state.players) {
    p.minorHand = ['__test_placeholder__']
    p.occupationHand = ['__test_placeholder__']
  }
}

/**
 * Isolation test for the generic extra-turn extension point
 * (`hasPendingExtraTurn` / `collectExtraTurnFlow`) using A92 as the consumer.
 * Built through a real GameSession so the full card registry is active (matches
 * production module-init order), but it exercises only the aggregate hooks —
 * not the rotation path. The rotation/turn behaviour is covered by the session
 * test (server/__tests__/A92-extra-turn-session.test.ts).
 */
const setupA92Player = (over: {
  played?: boolean
  newborns?: number
  food?: number
  forfeited?: boolean
} = {}) => {
  const session = new GameSession()
  const state = session.getState().state
  state.players = state.players.slice(0, 2)
  state.round = 1
  state.roundPhase = 'work'

  const p0 = state.players[0]!
  setActiveWorkerCount(p0, 2)
  setWorkersAtHome(state, p0, 0)
  const newborns = over.newborns ?? 1
  const active = p0.workers
    .filter((w) => w.isActive)
    .sort((a, b) => Number(a.id) - Number(b.id))
  for (let i = 0; i < newborns && i < active.length; i++) active[i]!.isNewborn = true
  if (over.played ?? true) p0.occupationPlayed.push(A92)
  p0.food = over.food ?? 2
  if (over.forfeited) {
    p0.cardStates = {
      ...(p0.cardStates ?? {}),
      [A92]: { extraData: { forfeitedThisRound: true } },
    }
  }

  const p1 = state.players[1]!
  setActiveWorkerCount(p1, 1)
  setWorkersAtHome(state, p1, 1)

  placeholderHands(state)
  session.loadState(state)
  const loaded = session.getState().state
  return { state: loaded, player: loaded.players[0]! }
}

describe('extra-turn extension point (isolation)', () => {
  it('true when holding A92 + has offspring + not forfeited (+ can afford)', () => {
    const { state, player } = setupA92Player()
    expect(hasPendingExtraTurn(state, player)).toBe(true)
    const collected = collectExtraTurnFlow(state, player)
    expect(collected?.cardId).toBe(A92)
    expect(collected?.flow.type).toBe('xor')
  })

  it('void when the card is not played', () => {
    const { state, player } = setupA92Player({ played: false })
    expect(hasPendingExtraTurn(state, player)).toBe(false)
  })

  it('void when there is no offspring', () => {
    const { state, player } = setupA92Player({ newborns: 0 })
    expect(hasPendingExtraTurn(state, player)).toBe(false)
  })

  it('void when already forfeited this round', () => {
    const { state, player } = setupA92Player({ forfeited: true })
    expect(hasPendingExtraTurn(state, player)).toBe(false)
  })

  it('void when food is insufficient to pay the cost', () => {
    const { state, player } = setupA92Player({ food: 0 })
    expect(hasPendingExtraTurn(state, player)).toBe(false)
  })

  it('XOR exposes exactly the use + forfeit options', () => {
    const { state, player } = setupA92Player()
    const collected = collectExtraTurnFlow(state, player)
    const values = (collected?.flow.options ?? []).map((o) => o.value)
    expect(values).toEqual(['use', 'forfeit'])
  })
})
