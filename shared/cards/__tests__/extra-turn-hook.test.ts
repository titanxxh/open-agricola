import { describe, it, expect } from 'vitest'
import { GameSession } from '../../../server/game/authoritative-session'
import { setActiveWorkerCount, setWorkersAtHome } from '../../domain/player'
import {
  hasPendingExtraTurn,
  collectExtraTurnFlow,
  countPendingExtraTurns,
  consumePendingExtraTurns,
} from '../card-effects'
import { requireActiveCardRegistry } from '../active-registry'
import { activateExtraTurnAction } from '../../actions/effects/internal/activate-extra-turn'
import { A092_AdoptiveParents } from '../../cards/A/A092_AdoptiveParents'
import '../A/A092_AdoptiveParents'

const A92 = A092_AdoptiveParents.id
const TEST_EXTRA = 'TEST_ExtraTurnProvider'

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
  p0.resources.food = over.food ?? 2
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

  it('XOR exposes exactly two branches (use, forfeit) addressed by index', () => {
    const { state, player } = setupA92Player()
    const flow = collectExtraTurnFlow(state, player)?.flow
    expect(flow?.type).toBe('xor')
    const branches = (flow && flow.type === 'xor' ? flow.children : []) as Array<{
      choiceLabelKey?: string
    }>
    expect(branches).toHaveLength(2)
    expect(branches[0]?.choiceLabelKey).toBe('ui.interactionUseAbility')
    expect(branches[1]?.choiceLabelKey).toBe('ui.interactionDecline')
  })

  it('collects multiple providers as a one-shot trigger selection', () => {
    const { state, player } = setupA92Player()
    requireActiveCardRegistry('extra turn multi-provider test').setEffect({
      id: TEST_EXTRA,
      contributeExtraTurn: () => ({
        type: 'leaf',
        actionId: 'gain',
        params: { wood: 1 },
        sourceCard: TEST_EXTRA,
      }),
      countExtraTurns: () => 1,
    })
    player.minorPlayed.push(TEST_EXTRA)

    const collected = collectExtraTurnFlow(state, player)

    expect(collected?.cardId).toBeUndefined()
    expect(collected?.flow.type).toBe('parallel')
    if (collected?.flow.type !== 'parallel') throw new Error('expected trigger-select')
    expect(collected.flow.mode).toBe('trigger-select')
    expect(collected.flow.triggerSelectOnce).toBe(true)
    expect(collected.flow.children.map((child) => child.sourceCard)).toEqual([TEST_EXTRA, A92])
  })

  it('fails stale provider activation instead of silently consuming the provider prompt', () => {
    const { state, player } = setupA92Player()
    requireActiveCardRegistry('extra turn stale-provider test').setEffect({
      id: TEST_EXTRA,
      contributeExtraTurn: (_state, currentPlayer) => currentPlayer.resources.wood === 0
        ? {
            type: 'leaf',
            actionId: 'gain',
            params: { clay: 1 },
            sourceCard: TEST_EXTRA,
          }
        : undefined,
      countExtraTurns: () => 1,
    })
    player.minorPlayed.push(TEST_EXTRA)
    expect(collectExtraTurnFlow(state, player)?.flow.type).toBe('parallel')

    player.resources.wood = 1
    const result = activateExtraTurnAction.execute({
      state,
      player,
      params: { cardId: TEST_EXTRA },
    } as Parameters<typeof activateExtraTurnAction.execute>[0])

    expect(result.type).toBe('fail')
  })

  it('counts remaining opportunities after skipped and forced consumed counters', () => {
    const { state, player } = setupA92Player({ newborns: 2, food: 2 })

    expect(countPendingExtraTurns(state, player)).toBe(2)
    player._extraTurnSkipCountsByCard = { [A92]: 1 }
    expect(countPendingExtraTurns(state, player)).toBe(1)
    player._extraTurnConsumedCountsByCard = { [A92]: 1 }
    expect(countPendingExtraTurns(state, player)).toBe(0)
    expect(hasPendingExtraTurn(state, player)).toBe(false)
  })

  it('consumePendingExtraTurns records all remaining forced consumption', () => {
    const { state, player } = setupA92Player({ newborns: 2, food: 2 })

    const consumed = consumePendingExtraTurns(state, player)

    expect(consumed).toBe(2)
    expect(player._extraTurnConsumedCountsByCard).toEqual({ [A92]: 2 })
    expect(countPendingExtraTurns(state, player)).toBe(0)
    expect(collectExtraTurnFlow(state, player)).toBeNull()
  })

  it('consumePendingExtraTurns respects already skipped opportunities', () => {
    const { state, player } = setupA92Player({ newborns: 2, food: 2 })
    player._extraTurnSkipCountsByCard = { [A92]: 1 }

    const consumed = consumePendingExtraTurns(state, player)

    expect(consumed).toBe(1)
    expect(player._extraTurnConsumedCountsByCard).toEqual({ [A92]: 1 })
    expect(countPendingExtraTurns(state, player)).toBe(0)
    expect(collectExtraTurnFlow(state, player)).toBeNull()
  })

  it('consumePendingExtraTurns silently no-ops when nothing is pending', () => {
    const { state, player } = setupA92Player({ food: 0 })

    expect(consumePendingExtraTurns(state, player)).toBe(0)
    expect(player._extraTurnConsumedCountsByCard).toBeUndefined()
  })
})
