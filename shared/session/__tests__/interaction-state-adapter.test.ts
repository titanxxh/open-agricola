import { describe, expect, it } from 'vitest'
import type { ActionFlow, InteractionCommand } from '../../contract/types'
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

const pendingStack = (): EngineStack => {
  const root = new ActionNode('interaction:confirm-next-player-1', INTERACTION_ONLY_ACTION_ID)
  root.setPending({
    hostNodeId: root.id,
    pendingActionId: INTERACTION_ONLY_ACTION_ID,
    request: { kind: 'confirm-next-player', nextPlayerIndex: 1 },
    choices: [{ value: 'confirm', labelKey: 'ui.interactionConfirm' }],
    promptKey: 'ui.confirmNextPlayer',
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
      animalReorgZones: () => [],
      isSelectionPrompt: () => false,
      buildSelectionInteraction: () => {
        throw new Error('selection interaction should not be built')
      },
      buildFarmInteraction: () => null,
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
})
