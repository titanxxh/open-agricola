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

  it('snapshots pending envelopes only through pendingData', () => {
    const root = new ActionNode('pending-root', 'gain')
    const options = [{ value: 'confirm', labelKey: 'ui.cursorTestConfirm' }]
    root.setPending({
      hostNodeId: root.id,
      request: { kind: 'choice', options },
      choices: options,
      promptKey: 'ui.interactionOptionalAction',
      pendingActionId: 'gain',
    })
    const engine = buildEngine(root)

    const snapshot = engine.snapshot()
    const legacySnapshotKey = 'choice' + 'Data'
    expect(legacySnapshotKey in snapshot).toBe(false)
    expect(snapshot.pendingData).toHaveLength(1)
    expect(snapshot.pendingData[0]?.pending.request.kind).toBe('choice')
  })

  it('rebases runtime counter after restoring cursor ids', () => {
    const restoredHost = new ActionNode('flow-0', 'gain')
    const snapshot: ReturnType<Engine['snapshot']> = {
      treeCursor: [restoredHost.toCursor()],
      nodeStates: [{ id: restoredHost.id, state: 'ready' }],
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
