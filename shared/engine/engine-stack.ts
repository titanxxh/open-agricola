import type { Engine } from './engine'
import type { ActionChoiceOption, ActionFlow, InteractionRequest } from '../game/types'
import type { PromptKey } from '../game/prompt-keys'
import type { EngineNode } from './types'

export type EngineSource =
  | { kind: 'action'; actionId: string }
  | { kind: 'flow'; flow: ActionFlow }

/**
 * Synthetic action id used for `__interaction_only__` engine frames pushed by
 * `GameCore.startConfirmNextPlayer` / `startConfirmPlayerSwitch` /
 * `startFeedSubFlow`. The engine treats this as a no-body action: the frame's
 * sole purpose is to host an `InteractionNode` that surfaces a typed
 * `InteractionRequest` (confirm-next-player / confirm-player-switch / feed)
 * which is resolved by `resolveChoice`. The id never resolves through the
 * `ActionRegistry`; consumers (`Engine.restore`, `runEngineSteps`) recognise
 * the literal and skip registry lookup / auto-resolve paths.
 */
export const INTERACTION_ONLY_ACTION_ID = '__interaction_only__'

export type SubFlowReason =
  | 'top-level'
  | 'stage-hook'
  | 'reorganize'
  | 'feed'
  | 'card-draft'
  | 'confirm-next-player'
  | 'confirm-player-switch'

export type StageResumeState = {
  hook: string
  playerIndex: number
  cardIndex: number
  extra?: Record<string, unknown>
}

export type EngineFrame = {
  engine: Engine
  source: EngineSource
  ownerPlayerIndex: number
  spaceId: string
  stageResume: StageResumeState | null
  deferredPlayerSwitch: { fromPlayerIndex: number; toPlayerIndex: number } | null
  reason: SubFlowReason
}

export type EngineFrameCursor = {
  source: EngineSource
  engineSnapshot: ReturnType<Engine['snapshot']>
  ownerPlayerIndex: number
  spaceId: string
  stageResume: StageResumeState | null
  deferredPlayerSwitch: { fromPlayerIndex: number; toPlayerIndex: number } | null
  reason: SubFlowReason
}

export type EngineStackCursor = {
  frames: EngineFrameCursor[]
}

/**
 * Predicate for synthetic interaction-only frames (the `__interaction_only__`
 * leaf-flow frames pushed by start* triggers in `GameCore`). These frames
 * carry an `InteractionNode` but have no real action body — `runEngineSteps`
 * / `Engine.restore` use this predicate to short-circuit auto-resolve and
 * registry lookup paths that would otherwise infinite-loop.
 */
export function isSyntheticInteractionFrame(frame: EngineFrame): boolean {
  return (
    frame.source.kind === 'flow' &&
    (frame.source.flow as { actionId?: string }).actionId === INTERACTION_ONLY_ACTION_ID
  )
}

/**
 * EngineStack — delegates several Engine internals (peekInteraction*,
 * peekPendingChoiceFromComposite, hasPendingChoiceCompositeAncestor,
 * insertFlowAfterPendingChoice) via `(engine as any)` casts. This is an
 * intentional package-internal convention: those methods are `private` on
 * Engine (TS compile-time only) so external callers cannot reach them, but
 * EngineStack lives in the same shared/engine/ folder and is part of the
 * package's internal coordination surface.
 */
export class EngineStack {
  private frames: EngineFrame[] = []

  push(frame: EngineFrame): void {
    this.frames.push(frame)
  }

  pop(): EngineFrame | undefined {
    return this.frames.pop()
  }

  current(): EngineFrame | undefined {
    return this.frames[this.frames.length - 1]
  }

  depth(): number {
    return this.frames.length
  }

  clear(): void {
    this.frames.length = 0
  }

  peekInteraction(): import('./nodes').InteractionNode | null {
    const engine = this.current()?.engine
    if (!engine) return null
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (engine as any).peekInteraction() ?? null
  }

  peekInteractionHost(): EngineNode | null {
    const engine = this.current()?.engine
    if (!engine) return null
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (engine as any).peekInteractionHost() ?? null
  }

  peekPendingChoiceFromComposite(): {
    nodeId: string
    promptKey?: PromptKey
    promptParams?: Record<string, unknown>
    options: ActionChoiceOption[]
    request?: InteractionRequest
  } | null {
    const engine = this.current()?.engine
    if (!engine) return null
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (engine as any).peekPendingChoiceFromComposite() ?? null
  }

  hasPendingChoiceCompositeAncestor(): boolean {
    const engine = this.current()?.engine
    if (!engine) return false
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (engine as any).hasPendingChoiceCompositeAncestor()
  }

  insertFlowAfterPendingChoice(flow: ActionFlow): void {
    const engine = this.current()?.engine
    if (!engine) return
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ;(engine as any).insertFlowAfterPendingChoice(flow)
  }

  toCursor(): EngineStackCursor {
    return {
      frames: this.frames.map((f) => ({
        source: f.source,
        engineSnapshot: f.engine.snapshot(),
        ownerPlayerIndex: f.ownerPlayerIndex,
        spaceId: f.spaceId,
        stageResume: f.stageResume,
        deferredPlayerSwitch: f.deferredPlayerSwitch,
        reason: f.reason,
      })),
    }
  }

  static fromCursor(
    cursor: EngineStackCursor,
    rebuild: (source: EngineSource, snapshot: ReturnType<Engine['snapshot']>) => Engine,
  ): EngineStack {
    const stack = new EngineStack()
    for (const fc of cursor.frames) {
      const engine = rebuild(fc.source, fc.engineSnapshot)
      stack.push({
        engine,
        source: fc.source,
        ownerPlayerIndex: fc.ownerPlayerIndex,
        spaceId: fc.spaceId,
        stageResume: fc.stageResume,
        deferredPlayerSwitch: fc.deferredPlayerSwitch,
        reason: fc.reason,
      })
    }
    return stack
  }
}
