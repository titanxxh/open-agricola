import { describe, expect, it } from 'vitest'
import { Engine } from '../engine'
import { EngineTree } from '../tree'
import { ActionRegistry } from '../registry'
import { HookDispatcher } from '../dispatcher'
import { LogStore } from '../log-store'
import { ActionNode } from '../nodes'

const buildEngine = (root = new ActionNode('initial-root', 'noop')) => new Engine({
  tree: new EngineTree(root),
  registry: new ActionRegistry(),
  hooks: new HookDispatcher(),
  log: new LogStore(),
})

describe('Engine.restore regressions', () => {
  it('restores mandatory metadata from a real engine snapshot', () => {
    const root = new ActionNode('mandatory-restore-root', 'gain')
    root.mandatory = true
    const original = buildEngine(root)
    const restored = buildEngine()

    restored.restore(original.snapshot())

    expect(restored._internals().tree.findNodeById('mandatory-restore-root')?.mandatory).toBe(true)
  })

  it('rehydrates legacy choiceData onto a live pending host when the stored host id is gone', () => {
    const restoredHost = new ActionNode('flow-0', 'gain')
    const snapshot: ReturnType<Engine['snapshot']> = {
      treeCursor: [restoredHost.toCursor()],
      nodeStates: [{ id: restoredHost.id, state: 'ready' }],
      choiceData: {
        id: 'legacy-interaction-0',
        hostNodeId: 'legacy-interaction-0',
        request: {
          kind: 'choice',
          options: [{ value: 'confirm', labelKey: 'ui.interactionConfirm' }],
        },
        choices: [{ value: 'confirm', labelKey: 'ui.interactionConfirm' }],
        promptKey: 'ui.interactionOptionalAction',
        pendingActionId: 'gain',
      },
      pendingData: [],
      compositeEmit: null,
      beforePhaseFlowNodeIds: [],
    }

    const engine = buildEngine()
    engine.restore(snapshot)

    const envelope = engine.peekPendingEnvelope()
    expect(envelope?.request.kind).toBe('choice')
    expect(envelope?.hostNodeId).toBe('flow-0')
    expect(engine.peekPendingHost()?.id).toBe('flow-0')
  })

  it('rebases runtime counter after restoring cursor ids', () => {
    const restoredHost = new ActionNode('flow-0', 'gain')
    const snapshot: ReturnType<Engine['snapshot']> = {
      treeCursor: [restoredHost.toCursor()],
      nodeStates: [{ id: restoredHost.id, state: 'ready' }],
      choiceData: null,
      pendingData: [],
      compositeEmit: null,
      beforePhaseFlowNodeIds: [],
    }

    const engine = buildEngine()
    engine.restore(snapshot)
    engine.injectBeforeFlows([{ type: 'leaf', actionId: 'gain' }])

    const ids = engine._internals().tree.allNodes().map((node) => node.id)
    expect(new Set(ids).size).toBe(ids.length)
    expect(ids).toContain('flow-1')
  })
})
