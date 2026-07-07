import { describe, expect, it } from 'vitest'
import type { ActionFlow, InteractionCommand, InteractionRequest } from '../../contract/types'
import {
  ActionNode,
  ActionRegistry,
  Engine,
  EngineStack,
  EngineTree,
  HookDispatcher,
  INTERACTION_ONLY_ACTION_ID,
  LogStore,
} from '../../engine'
import type { EngineFrame } from '../../engine'
import { createInitialState } from '../state-bootstrap'
import {
  deriveInteractionState,
  redactInteractionForViewer,
} from '../interaction-state-adapter'

const pendingStack = (
  request: InteractionRequest = { kind: 'confirm-next-player', nextPlayerIndex: 1 },
  promptKey = 'ui.confirmNextPlayer',
): EngineStack => {
  const root = new ActionNode('interaction:confirm-next-player-1', INTERACTION_ONLY_ACTION_ID)
  root.setPending({
    hostNodeId: root.id,
    pendingActionId: INTERACTION_ONLY_ACTION_ID,
    request,
    choices: [{ value: 'confirm', labelKey: 'ui.interactionConfirm' }],
    promptKey,
    syntheticKind: 'confirm-next-player',
  })
  const flow: ActionFlow = { type: 'leaf', actionId: INTERACTION_ONLY_ACTION_ID }
  const stack = new EngineStack()
  stack.push({
    engine: new Engine({
      tree: new EngineTree(root),
      registry: new ActionRegistry(),
      hooks: new HookDispatcher(),
      log: new LogStore(),
    }),
    source: { kind: 'flow', flow },
    ownerPlayerIndex: 0,
    spaceId: '__subflow:confirm-next-player',
    stageResume: null,
    deferredPlayerSwitch: null,
    reason: 'confirm-next-player',
  })
  return stack
}

const selectionPendingStack = (): EngineStack => {
  const root = new ActionNode('interaction:selection-1', INTERACTION_ONLY_ACTION_ID)
  root.setPending({
    hostNodeId: root.id,
    pendingActionId: INTERACTION_ONLY_ACTION_ID,
    request: { kind: 'choice', options: [{ value: 'confirm', labelKey: 'ui.interactionConfirmButton' }] },
    choices: [{ value: 'confirm', labelKey: 'ui.interactionConfirmButton' }],
    promptKey: 'ui.interactionSelection',
  })
  const flow: ActionFlow = { type: 'leaf', actionId: INTERACTION_ONLY_ACTION_ID }
  const stack = new EngineStack()
  stack.push({
    engine: new Engine({
      tree: new EngineTree(root),
      registry: new ActionRegistry(),
      hooks: new HookDispatcher(),
      log: new LogStore(),
    }),
    source: { kind: 'flow', flow },
    ownerPlayerIndex: 0,
    spaceId: '__selection',
    stageResume: null,
    deferredPlayerSwitch: null,
    reason: 'selection',
  })
  return stack
}

describe('Interaction State Adapter', () => {
  it('derives a public wait from EngineStack without caller-owned cursor reads', () => {
    const state = createInitialState(1)
    const interaction = deriveInteractionState({
      state,
      engineStack: pendingStack(),
      getAnytimeEntries: () => [],
      getAnytimePolicy: () => ({ allowed: false, reason: 'confirm-window' }),
      filterUndoCommands: (commands: readonly InteractionCommand[]) => [...commands],
      winnerIds: () => [],
      scoreSummary: () => [],
      effectiveOwnerIndexForFrame: (frame: EngineFrame) => frame.ownerPlayerIndex,
      projectPendingRequest: ({ request }) => request,
    })

    expect(interaction).toMatchObject({
      stateId: 'wait',
      playerIndex: 0,
      request: { kind: 'confirm-next-player', nextPlayerIndex: 1 },
      allowedCommands: ['resolveChoice', 'undoStep', 'undoAction'],
      anytimeActions: [],
    })
    expect(interaction).not.toHaveProperty('nextPlayerIndex')
  })

  it('redacts another player wait interaction for viewer payloads', () => {
    const interaction = {
      stateId: 'wait',
      playerIndex: 0,
      sourceCard: 'E078_SleightofHand',
      promptKey: 'ui.interactionResourceBatchExchange',
      request: {
        kind: 'resource-batch-exchange-select',
        cardId: 'E078_SleightofHand',
        discardAvailableByResource: { wood: 1 },
        receiveResources: ['food'],
        maxTotal: 1,
      },
      allowedCommands: ['commitSelection'],
      anytimeActions: [],
    } as const

    expect(redactInteractionForViewer(interaction, ['p1', 'p2'], 'p1')).toEqual(interaction)
    expect(redactInteractionForViewer(interaction, ['p1', 'p2'], 'p2')).toEqual({
      stateId: 'wait',
      playerIndex: 0,
      sourceCard: 'E078_SleightofHand',
      promptKey: 'ui.interactionResourceBatchExchange',
      request: {
        kind: 'private-prompt',
        playerIndex: 0,
        promptKind: 'resource-batch-exchange-select',
        sourceCard: 'E078_SleightofHand',
        promptKey: 'ui.interactionResourceBatchExchange',
      },
      allowedCommands: [],
      anytimeActions: [],
    })
  })

  it('keeps pending choice options on selection waits', () => {
    const state = createInitialState(1)
    const interaction = deriveInteractionState({
      state,
      engineStack: selectionPendingStack(),
      getAnytimeEntries: () => [],
      getAnytimePolicy: () => ({ allowed: false, reason: 'selection-window' }),
      filterUndoCommands: (commands: readonly InteractionCommand[]) => [...commands],
      winnerIds: () => [],
      scoreSummary: () => [],
      effectiveOwnerIndexForFrame: (frame: EngineFrame) => frame.ownerPlayerIndex,
      projectPendingRequest: () => ({
        kind: 'selection',
        selection: {
          kind: 'farm-position',
          selectablePositions: [{ row: 0, col: 0 }],
          maxSelections: 1,
        },
      }),
    })

    expect(interaction.stateId).toBe('wait')
    if (interaction.stateId !== 'wait') return
    expect(interaction.request.kind).toBe('selection')
    if (interaction.request.kind !== 'selection') return
    expect(interaction.request.options?.map((entry) => entry.value)).toEqual(['confirm'])
  })

  it('uses the projected request kind for wait commands', () => {
    const state = createInitialState(1)
    const interaction = deriveInteractionState({
      state,
      engineStack: selectionPendingStack(),
      getAnytimeEntries: () => [],
      getAnytimePolicy: () => ({ allowed: false, reason: 'selection-window' }),
      filterUndoCommands: (commands: readonly InteractionCommand[]) => [...commands],
      winnerIds: () => [],
      scoreSummary: () => [],
      effectiveOwnerIndexForFrame: (frame: EngineFrame) => frame.ownerPlayerIndex,
      projectPendingRequest: () => ({
        kind: 'farm-select',
        farm: { farmType: 'plow', selectableTiles: [{ row: 0, col: 0 }] },
      }),
    })

    expect(interaction.stateId).toBe('wait')
    if (interaction.stateId !== 'wait') return
    expect(interaction.request.kind).toBe('farm-select')
    expect(interaction.allowedCommands).toEqual(['commitSelection', 'undoStep', 'undoAction'])
  })

  it('suppresses anytime commands on engine-blocked waits', () => {
    const state = createInitialState(1)
    const interaction = deriveInteractionState({
      state,
      engineStack: pendingStack(
        { kind: 'engine-blocked', reasonKey: 'ui.blocked' },
        'ui.originalPrompt',
      ),
      getAnytimeEntries: () => [
        { descriptor: { id: 'anytime-test', labelKey: 'anytime.test', actionId: 'anytime-test' } },
      ],
      getAnytimePolicy: () => ({ allowed: true, reason: 'test' }),
      filterUndoCommands: (commands: readonly InteractionCommand[]) => [...commands],
      winnerIds: () => [],
      scoreSummary: () => [],
      effectiveOwnerIndexForFrame: (frame: EngineFrame) => frame.ownerPlayerIndex,
      projectPendingRequest: ({ request }) => request,
    })

    expect(interaction.stateId).toBe('wait')
    if (interaction.stateId !== 'wait') return
    expect(interaction.promptKey).toBe('ui.blocked')
    expect(interaction.allowedCommands).toEqual(['undoStep', 'undoAction'])
    expect(interaction.anytimeActions).toEqual([])
  })

  it('does not offer the anytime command while an ordinary card draw choice is pending', () => {
    const state = createInitialState(1)
    state.ordinaryCardDrawChoices['draw-1'] = {
      id: 'draw-1',
      playerId: state.players[0]!.id,
      cardType: 'minor',
      candidates: ['A001_Test'],
    }
    const interaction = deriveInteractionState({
      state,
      engineStack: new EngineStack(),
      getAnytimeEntries: () => [
        { descriptor: { id: 'anytime-test', labelKey: 'anytime.test', actionId: 'anytime-test' } },
      ],
      getAnytimePolicy: () => ({ allowed: true, reason: 'test' }),
      filterUndoCommands: (commands: readonly InteractionCommand[]) => [...commands],
      winnerIds: () => [],
      scoreSummary: () => [],
      effectiveOwnerIndexForFrame: (frame: EngineFrame) => frame.ownerPlayerIndex,
      projectPendingRequest: ({ request }) => request,
    })

    expect(interaction).toMatchObject({
      stateId: 'idle',
      allowedCommands: ['undoStep', 'undoAction'],
    })
    expect(interaction.stateId === 'idle' ? interaction.anytimeActions.map((entry) => entry.id) : [])
      .toEqual(['anytime-test'])
  })
})
