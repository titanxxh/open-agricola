import { describe, expect, it } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import type { ActionFlow } from '../../shared/game/types'
import { confirmPlayerSwitch } from './_helpers/legacy-confirms'

/**
 * Tests for ActionFlow playerSwitch support with lazy confirmation.
 *
 * These tests directly set up a flow engine on the session to verify:
 * 1. Auto-gain after switch completes without confirmPlayerSwitch
 * 2. Choice after switch shows confirmPlayerSwitch first (lazy confirmation)
 * 3. Multiple ok steps then choice still shows confirmPlayerSwitch
 */
describe('ActionFlow playerSwitch', () => {
  const setupSession = () => {
    const session = new GameSession()
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    state.currentPlayerIndex = 0
    session.loadState(state)
    return session
  }

  const startFlowEngine = (session: GameSession, flow: ActionFlow, playerIndex: number) => {
    const s = session as unknown as {
      engineStack: {
        push: (frame: {
          engine: unknown
          source: unknown
          spaceId: string
          ownerPlayerIndex: number
          stageResume: null
          deferredPlayerSwitch: null
          reason: string
        }) => void
      }
      pending: { type: string }
      createFlowEngine: (flow: ActionFlow) => unknown
      runEngineSteps: () => void
    }
    const state = session.getState().state
    // Set up a stage-like action space so runEngineSteps can proceed
    const spaceId = '__stage:test'
    state.actionSpaces.push({
      id: spaceId,
      nameKey: 'test',
      descriptionKey: 'test',
      type: 'round',
      roundAvailable: 1,
      takenBy: [],
      accumulated: {},
      gainPerRound: {},
      resources: {
        wood: 0, clay: 0, reed: 0, stone: 0, food: 0,
        grain: 0, vegetable: 0, sheep: 0, boar: 0, cattle: 0, begging: 0,
      },
      canBeExecutedByPlayer: () => true,
      execute: () => ({ type: 'ok' }),
    } as any)
    session.loadState(state)
    s.engineStack.push({
      engine: s.createFlowEngine(flow),
      source: { kind: 'flow', flow },
      spaceId,
      ownerPlayerIndex: playerIndex,
      stageResume: null,
      deferredPlayerSwitch: null,
      reason: 'card-draft',
    })
    s.pending = { type: 'none' }
    s.runEngineSteps()
  }

  it('auto-gain after switch completes without confirmPlayerSwitch', () => {
    const session = setupSession()
    const state = session.getState().state
    const p1 = state.players[0]!
    const p2 = state.players[1]!
    const p2FoodBefore = p2.resources.food

    const flow: ActionFlow = {
      type: 'seq',
      children: [
        { type: 'playerSwitch', targetPlayerId: p2.id },
        { type: 'leaf', actionId: 'gain', params: { food: 1 }, sourceCard: 'TestAutoGain' },
        { type: 'playerSwitch', targetPlayerId: p1.id },
      ],
    }

    startFlowEngine(session, flow, 0)

    const resp = session.getState()
    // Should NOT be confirmPlayerSwitch — the gain was auto-applied
    expect(resp.pending.type).not.toBe('confirmPlayerSwitch')
    // p2 should have gained 1 food
    expect(resp.state.players[1]!.resources.food).toBe(p2FoodBefore + 1)
  })

  it('choice after switch shows confirmPlayerSwitch first (lazy confirmation)', () => {
    const session = setupSession()
    const state = session.getState().state
    const p1 = state.players[0]!
    const p2 = state.players[1]!

    const flow: ActionFlow = {
      type: 'seq',
      children: [
        { type: 'playerSwitch', targetPlayerId: p2.id },
        {
          type: 'xor',
          children: [
            { type: 'leaf', actionId: 'gain', params: { sheep: 2 }, sourceCard: 'TestChoice', choiceLabelKey: 'sheep' },
            { type: 'leaf', actionId: 'gain', params: { food: 2 }, sourceCard: 'TestChoice', choiceLabelKey: 'food' },
          ],
        },
        { type: 'playerSwitch', targetPlayerId: p1.id },
      ],
    }

    startFlowEngine(session, flow, 0)

    // Should be confirmPlayerSwitch (deferred), not choice
    const resp1 = session.getState()
    expect(resp1.interaction.stateId === 'wait' ? resp1.interaction.request.kind : resp1.interaction.stateId).toBe('confirm-player-switch')

    // Confirm the switch
    const resp2 = confirmPlayerSwitch(session)
    expect(resp2.ok).toBe(true)

    // Now should be a choice (XOR)
    const resp3 = session.getState()
    expect(resp3.interaction.stateId).toBe('wait')
  })

  it('multiple ok steps then choice still shows confirmPlayerSwitch', () => {
    const session = setupSession()
    const state = session.getState().state
    const p1 = state.players[0]!
    const p2 = state.players[1]!
    const p2FoodBefore = p2.resources.food
    const p2WoodBefore = p2.resources.wood

    const flow: ActionFlow = {
      type: 'seq',
      children: [
        { type: 'playerSwitch', targetPlayerId: p2.id },
        { type: 'leaf', actionId: 'gain', params: { food: 1 }, sourceCard: 'TestMulti' },
        { type: 'leaf', actionId: 'gain', params: { wood: 1 }, sourceCard: 'TestMulti' },
        {
          type: 'xor',
          children: [
            { type: 'leaf', actionId: 'gain', params: { sheep: 1 }, sourceCard: 'TestMulti', choiceLabelKey: 'sheep' },
            { type: 'leaf', actionId: 'gain', params: { clay: 1 }, sourceCard: 'TestMulti', choiceLabelKey: 'clay' },
          ],
        },
        { type: 'playerSwitch', targetPlayerId: p1.id },
      ],
    }

    startFlowEngine(session, flow, 0)

    // Auto-gains should have happened
    const resp1 = session.getState()
    expect(resp1.state.players[1]!.resources.food).toBe(p2FoodBefore + 1)
    expect(resp1.state.players[1]!.resources.wood).toBe(p2WoodBefore + 1)

    // But pending should be confirmPlayerSwitch (not choice)
    expect(resp1.interaction.stateId === 'wait' ? resp1.interaction.request.kind : resp1.interaction.stateId).toBe('confirm-player-switch')

    // Confirm, then should see choice
    confirmPlayerSwitch(session)
    const resp2 = session.getState()
    expect(resp2.interaction.stateId).toBe('wait')
  })
})
