import { describe, expect, it } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import type { ActionDefinition, ActionFlow } from '../../shared/contract/types'
import { confirmPlayerSwitch } from './_helpers/legacy-confirms'
import { rehydrateState, serializeState } from '../../shared/session/serialization'

/**
 * Tests for ActionFlow targetPlayerId metadata with lazy confirmation.
 *
 * These tests directly set up a flow engine on the session to verify:
 * 1. Auto-gain after switch completes without confirmPlayerSwitch
 * 2. Choice after switch shows confirmPlayerSwitch first (lazy confirmation)
 * 3. Multiple ok steps then choice still shows confirmPlayerSwitch
 */
describe('ActionFlow targetPlayerId', () => {
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
    s.runEngineSteps()
  }

  const compileFlowNodeCursors = (session: GameSession, flow: ActionFlow, playerIndex: number) => {
    const s = session as unknown as {
      createFlowEngine: (flow: ActionFlow, ownerPlayerIndex?: number) => {
        _internals: () => {
          tree: {
            allNodes: () => Array<{
              toCursor: () => { type: string; data: Record<string, unknown> }
            }>
          }
        }
      }
    }
    return s
      .createFlowEngine(flow, playerIndex)
      ._internals()
      .tree.allNodes()
      .map((node) => node.toCursor())
  }

  it('compiles targetPlayerId flows without playerSwitch cursors', () => {
    const session = setupSession()
    const state = session.getState().state
    const p2 = state.players[1]!

    const flow: ActionFlow = {
      type: 'seq',
      children: [
        {
          type: 'xor',
          targetPlayerId: p2.id,
          children: [
            { type: 'leaf', actionId: 'gain', params: { sheep: 1 }, sourceCard: 'TestNoSwitch', choiceLabelKey: 'sheep' },
            { type: 'leaf', actionId: 'gain', params: { food: 1 }, sourceCard: 'TestNoSwitch', choiceLabelKey: 'food' },
          ],
        },
      ],
    }

    expect(compileFlowNodeCursors(session, flow, 0).map((cursor) => cursor.type)).not.toContain('playerSwitch')
  })

  it('compiled nested targetPlayerId preserves the inner owner override', () => {
    const session = setupSession()
    const state = session.getState().state
    const p1 = state.players[0]!
    const p2 = state.players[1]!

    const flow: ActionFlow = {
      type: 'seq',
      targetPlayerId: p2.id,
      children: [
        { type: 'leaf', actionId: 'gain', params: { food: 1 }, sourceCard: 'OuterTarget' },
        { type: 'leaf', actionId: 'gain', params: { wood: 1 }, sourceCard: 'InnerTarget', targetPlayerId: p1.id },
      ],
    }

    const actionCursors = compileFlowNodeCursors(session, flow, 0)
      .filter((cursor) => cursor.type === 'action')
    const outerLeaf = actionCursors.find((cursor) => cursor.data.sourceCard === 'OuterTarget')
    const innerLeaf = actionCursors.find((cursor) => cursor.data.sourceCard === 'InnerTarget')

    expect(outerLeaf?.data.ownerPlayerId).toBe(p2.id)
    expect(innerLeaf?.data.ownerPlayerId).toBe(p1.id)
  })

  it('does not derive optional owner for mixed-owner subtrees', () => {
    const session = setupSession()
    const state = session.getState().state
    const p2 = state.players[1]!

    const flow: ActionFlow = {
      type: 'seq',
      optional: true,
      children: [
        { type: 'leaf', actionId: 'gain', params: { food: 1 }, sourceCard: 'MixedOwnerTarget', targetPlayerId: p2.id },
        { type: 'leaf', actionId: 'gain', params: { wood: 1 }, sourceCard: 'MixedOwnerFrame' },
      ],
    }

    const optionalSeq = compileFlowNodeCursors(session, flow, 0)
      .find((cursor) => cursor.type === 'sequence' && cursor.data.optional === true)
    expect(optionalSeq?.data.ownerPlayerId).toBeUndefined()
  })

  it('auto-gain after switch completes without confirmPlayerSwitch', () => {
    const session = setupSession()
    const state = session.getState().state
    const p2 = state.players[1]!
    const p2FoodBefore = p2.resources.food

    const flow: ActionFlow = {
      type: 'seq',
      children: [
        { type: 'leaf', actionId: 'gain', params: { food: 1 }, sourceCard: 'TestAutoGain', targetPlayerId: p2.id },
      ],
    }

    startFlowEngine(session, flow, 0)

    const resp = session.getState()
    // Should NOT be confirmPlayerSwitch — the gain was auto-applied
    expect(resp.interaction.stateId === 'wait' ? resp.interaction.request.kind : resp.interaction.stateId).not.toBe('confirm-player-switch')
    // p2 should have gained 1 food
    expect(resp.state.players[1]!.resources.food).toBe(p2FoodBefore + 1)
  })

  it('choice after switch shows confirmPlayerSwitch first (lazy confirmation)', () => {
    const session = setupSession()
    const state = session.getState().state
    const p2 = state.players[1]!

    const flow: ActionFlow = {
      type: 'seq',
      children: [
        {
          type: 'xor',
          targetPlayerId: p2.id,
          children: [
            { type: 'leaf', actionId: 'gain', params: { sheep: 2 }, sourceCard: 'TestChoice', choiceLabelKey: 'sheep' },
            { type: 'leaf', actionId: 'gain', params: { food: 2 }, sourceCard: 'TestChoice', choiceLabelKey: 'food' },
          ],
        },
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

  it('optional sequence with targeted xor prompts as the target owner', () => {
    const session = setupSession()
    const state = session.getState().state
    const p2 = state.players[1]!

    const flow: ActionFlow = {
      type: 'seq',
      optional: true,
      promptKey: 'ui.interactionOptionalAction',
      children: [
        {
          type: 'xor',
          targetPlayerId: p2.id,
          children: [
            { type: 'leaf', actionId: 'gain', params: { sheep: 1 }, sourceCard: 'TestOptionalTarget', choiceLabelKey: 'sheep' },
            { type: 'leaf', actionId: 'gain', params: { food: 1 }, sourceCard: 'TestOptionalTarget', choiceLabelKey: 'food' },
          ],
        },
      ],
    }

    startFlowEngine(session, flow, 0)
    const confirmResp = session.getState()
    expect(confirmResp.interaction.stateId === 'wait' ? confirmResp.interaction.request.kind : confirmResp.interaction.stateId).toBe('confirm-player-switch')

    const pendingResp = confirmPlayerSwitch(session)
    expect(pendingResp.ok).toBe(true)
    expect(pendingResp.interaction.stateId).toBe('wait')
    if (pendingResp.interaction.stateId !== 'wait') return
    expect(pendingResp.interaction.playerIndex).toBe(1)
    const acceptOption = pendingResp.interaction.options?.find((option) => option.value !== '__skip__')
    expect(acceptOption).toBeDefined()

    const wrongPlayer = session.resolveChoice(0, acceptOption!.value)
    expect(wrongPlayer.ok).toBe(false)
    expect(wrongPlayer.ok ? '' : wrongPlayer.error).toBe('no pending choice for this player')

    const accepted = session.resolveChoice(1, acceptOption!.value)
    expect(accepted.ok).toBe(true)
  })

  it('multiple ok steps then choice still shows confirmPlayerSwitch', () => {
    const session = setupSession()
    const state = session.getState().state
    const p2 = state.players[1]!
    const p2FoodBefore = p2.resources.food
    const p2WoodBefore = p2.resources.wood

    const flow: ActionFlow = {
      type: 'seq',
      children: [
        { type: 'leaf', actionId: 'gain', params: { food: 1 }, sourceCard: 'TestMulti', targetPlayerId: p2.id },
        { type: 'leaf', actionId: 'gain', params: { wood: 1 }, sourceCard: 'TestMulti', targetPlayerId: p2.id },
        {
          type: 'xor',
          targetPlayerId: p2.id,
          children: [
            { type: 'leaf', actionId: 'gain', params: { sheep: 1 }, sourceCard: 'TestMulti', choiceLabelKey: 'sheep' },
            { type: 'leaf', actionId: 'gain', params: { clay: 1 }, sourceCard: 'TestMulti', choiceLabelKey: 'clay' },
          ],
        },
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

  it('restores dynamic targeted pending flow and resumes unowned sibling as frame owner', () => {
    const session = setupSession()
    const state = session.getState().state
    const p1 = state.players[0]!
    const p2 = state.players[1]!
    const triggerAction: ActionDefinition = {
      id: 'trigger-dynamic-targeted-pending',
      nameKey: 'test.triggerDynamicTargetedPending',
      descriptionKey: 'test.triggerDynamicTargetedPending',
      roundAvailable: 1,
      gainPerRound: {},
      canBeExecutedByPlayer: () => true,
      execute: () => ({
        type: 'flow',
        flow: {
          type: 'seq',
          children: [
            {
              type: 'xor',
              targetPlayerId: p2.id,
              children: [
                { type: 'leaf', actionId: 'gain', params: { sheep: 1 }, sourceCard: 'DynamicTargetedPending', choiceLabelKey: 'sheep' },
                { type: 'leaf', actionId: 'gain', params: { food: 1 }, sourceCard: 'DynamicTargetedPending', choiceLabelKey: 'food' },
              ],
            },
            { type: 'leaf', actionId: 'gain', params: { wood: 1 }, sourceCard: 'DynamicUntargetedSibling' },
          ],
        },
      }),
    }
    ;(session as unknown as { registry: { register: (action: ActionDefinition) => void } })
      .registry.register(triggerAction)

    startFlowEngine(session, { type: 'leaf', actionId: triggerAction.id }, 0)
    const confirmResp = session.getState()
    expect(confirmResp.interaction.stateId === 'wait' ? confirmResp.interaction.request.kind : confirmResp.interaction.stateId).toBe('confirm-player-switch')

    const pendingResp = confirmPlayerSwitch(session)
    expect(pendingResp.ok).toBe(true)
    expect(pendingResp.interaction.stateId).toBe('wait')
    if (pendingResp.interaction.stateId !== 'wait') return
    expect(pendingResp.interaction.playerIndex).toBe(1)
    const sheepOption = pendingResp.interaction.options?.find((option) => option.labelKey === 'sheep')
    expect(sheepOption).toBeDefined()
    expect(session.getEngineStack().peekPendingEnvelope()?.effectiveOwnerPlayerId).toBe(p2.id)

    const serialized = serializeState(session.getState().state, {
      engineStack: session.getEngineStack(),
    })
    const restored = new GameSession(rehydrateState(JSON.parse(JSON.stringify(serialized))))
    expect(restored.getEngineStack().peekPendingEnvelope()?.effectiveOwnerPlayerId).toBe(p2.id)

    const resolved = restored.resolveChoice(1, sheepOption!.value)
    expect(resolved.ok).toBe(true)
    expect(resolved.state.players[1]!.resources.sheep).toBe(p2.resources.sheep + 1)
    expect(resolved.state.players[0]!.resources.wood).toBe(p1.resources.wood + 1)
    expect(resolved.state.players[1]!.resources.wood).toBe(p2.resources.wood)
  })

  it('undoStep cancels a targeted farm prompt as the effective owner', () => {
    const session = setupSession()
    const state = session.getState().state
    const p2 = state.players[1]!

    const flow: ActionFlow = {
      type: 'leaf',
      actionId: 'plow',
      targetPlayerId: p2.id,
    }

    startFlowEngine(session, flow, 0)
    const confirmResp = session.getState()
    expect(confirmResp.interaction.stateId === 'wait' ? confirmResp.interaction.request.kind : confirmResp.interaction.stateId).toBe('confirm-player-switch')

    const pendingResp = confirmPlayerSwitch(session)
    expect(pendingResp.ok).toBe(true)
    expect(pendingResp.interaction.stateId).toBe('wait')
    if (pendingResp.interaction.stateId !== 'wait') return
    expect(pendingResp.interaction.playerIndex).toBe(1)
    expect(pendingResp.interaction.farm).toBeDefined()

    const undoResp = session.undoStep()
    expect(undoResp.ok).toBe(true)
    expect(undoResp.ok ? '' : undoResp.error).not.toBe('no pending choice for this player')
  })

  it('targeted action dynamic flow executes as the target owner', () => {
    const session = setupSession()
    const state = session.getState().state
    const p1 = state.players[0]!
    const p2 = state.players[1]!
    const p1WoodBefore = p1.resources.wood
    const p2WoodBefore = p2.resources.wood
    const dynamicGainWood: ActionDefinition = {
      id: 'dynamic-gain-wood-flow-from-action',
      nameKey: 'test.dynamicGainWoodFlowFromAction',
      descriptionKey: 'test.dynamicGainWoodFlowFromAction',
      roundAvailable: 1,
      gainPerRound: {},
      canBeExecutedByPlayer: () => true,
      execute: () => ({
        type: 'flow',
        flow: { type: 'leaf', actionId: 'gain', params: { wood: 1 } },
      }),
    }
    ;(session as unknown as { registry: { register: (action: ActionDefinition) => void } })
      .registry.register(dynamicGainWood)

    const flow: ActionFlow = {
      type: 'leaf',
      actionId: dynamicGainWood.id,
      targetPlayerId: p2.id,
    }

    startFlowEngine(session, flow, 0)

    const resp = session.getState()
    expect(resp.state.players[1]!.resources.wood).toBe(p2WoodBefore + 1)
    expect(resp.state.players[0]!.resources.wood).toBe(p1WoodBefore)
  })

  it('targeted xor dynamic flow executes as the target owner', () => {
    const session = setupSession()
    const state = session.getState().state
    const p1 = state.players[0]!
    const p2 = state.players[1]!
    const p1WoodBefore = p1.resources.wood
    const p2WoodBefore = p2.resources.wood
    const dynamicGainWood: ActionDefinition = {
      id: 'dynamic-gain-wood-flow',
      nameKey: 'test.dynamicGainWoodFlow',
      descriptionKey: 'test.dynamicGainWoodFlow',
      roundAvailable: 1,
      gainPerRound: {},
      canBeExecutedByPlayer: () => true,
      execute: () => ({
        type: 'flow',
        flow: { type: 'leaf', actionId: 'gain', params: { wood: 1 } },
      }),
    }
    ;(session as unknown as { registry: { register: (action: ActionDefinition) => void } })
      .registry.register(dynamicGainWood)

    const flow: ActionFlow = {
      type: 'xor',
      targetPlayerId: p2.id,
      children: [
        {
          type: 'leaf',
          actionId: dynamicGainWood.id,
          sourceCard: 'TargetedDynamicXor',
          choiceLabelKey: 'wood',
        },
        {
          type: 'leaf',
          actionId: 'gain',
          params: { food: 1 },
          sourceCard: 'TargetedDynamicXor',
          choiceLabelKey: 'food',
        },
      ],
    }

    startFlowEngine(session, flow, 0)
    expect(session.getState().interaction.stateId === 'wait'
      ? session.getState().interaction.request.kind
      : session.getState().interaction.stateId).toBe('confirm-player-switch')

    const pendingResp = confirmPlayerSwitch(session)
    expect(pendingResp.ok).toBe(true)
    expect(pendingResp.interaction.stateId).toBe('wait')
    if (pendingResp.interaction.stateId !== 'wait') return
    expect(pendingResp.interaction.playerIndex).toBe(1)
    const woodOption = pendingResp.interaction.options?.find((option) => option.labelKey === 'wood')
    expect(woodOption).toBeDefined()

    const resolved = session.resolveChoice(1, woodOption!.value)
    expect(resolved.ok).toBe(true)
    expect(resolved.state.players[1]!.resources.wood).toBe(p2WoodBefore + 1)
    expect(resolved.state.players[0]!.resources.wood).toBe(p1WoodBefore)
  })
})
