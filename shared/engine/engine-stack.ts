import type { Engine } from './engine'
import type { ActionChoiceOption, ActionFlow, InteractionRequest } from '../contract/types'
import type { PromptKey } from '../contract/prompt-keys'
import type { EngineNode, PendingCursor, PendingEnvelope, PendingView } from './types'
import { pendingCursorFromEnvelope, pendingViewFromEnvelope } from './engine-utils'

export type EngineSource =
  | { kind: 'action'; actionId: string }
  | { kind: 'flow'; flow: ActionFlow }

/**
 * Synthetic action id used for `__interaction_only__` engine frames pushed by
 * `GameCore.startConfirmNextPlayer` / `startConfirmPlayerSwitch` /
 * `startFeedSubFlow`. The engine treats this as a no-body action: the frame's
 * sole purpose is to host a pending envelope that surfaces a typed
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
  | 'heating'
  | 'post-reap-anytime'
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
  frameId?: string
  engine: Engine
  source: EngineSource
  ownerPlayerIndex: number
  spaceId: string
  stageResume: StageResumeState | null
  deferredPlayerSwitch: {
    fromPlayerIndex: number
    toPlayerIndex: number
    confirmed?: boolean
    returnPlayerStack?: number[]
  } | null
  undoBoundaryOnResolve?: boolean
  reason: SubFlowReason
}

export type EngineFrameCursor = {
  frameId?: string
  source: EngineSource
  engineSnapshot: ReturnType<Engine['snapshot']>
  ownerPlayerIndex: number
  spaceId: string
  stageResume: StageResumeState | null
  deferredPlayerSwitch: {
    fromPlayerIndex: number
    toPlayerIndex: number
    confirmed?: boolean
    returnPlayerStack?: number[]
  } | null
  undoBoundaryOnResolve?: boolean
  reason: SubFlowReason
}

export type EngineStackCursor = {
  frames: EngineFrameCursor[]
}

/**
 * Predicate for synthetic interaction-only frames (the `__interaction_only__`
 * leaf-flow frames pushed by start* triggers in `GameCore`). These frames
 * carry a pending envelope but have no real action body — `runEngineSteps`
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
 * EngineStack — delegates to a small set of `@internal`-marked methods on
 * Engine (peekPending*, peekPendingChoiceFromComposite,
 * hasPendingChoiceCompositeAncestor, insertFlowAfterPendingChoice). These
 * methods are implementation details of the shared/engine/ package; the
 * `engine-public-surface.test.ts` guard enumerates them in PRIVATE_HELPERS
 * to lock the surface, and external callers (session-core, round.ts) go
 * through this stack instead of touching them directly.
 */
export class EngineStack {
  private frames: EngineFrame[] = []
  private nextFrameId = 1

  push(frame: EngineFrame): void {
    frame.frameId ??= `engine-frame-${this.nextFrameId++}`
    const match = /^engine-frame-(\d+)$/.exec(frame.frameId)
    if (match) this.nextFrameId = Math.max(this.nextFrameId, Number(match[1]) + 1)
    this.frames.push(frame)
  }

  pop(): EngineFrame | undefined {
    return this.frames.pop()
  }

  current(): EngineFrame | undefined {
    return this.frames[this.frames.length - 1]
  }

  replaceCurrentFrameEngine(engine: Engine, source: EngineSource): boolean {
    const frame = this.current()
    if (!frame) return false
    frame.engine = engine
    frame.source = source
    return true
  }

  setDeferredPlayerSwitch(deferredPlayerSwitch: NonNullable<EngineFrame['deferredPlayerSwitch']>): boolean {
    const frame = this.current()
    if (!frame) return false
    frame.deferredPlayerSwitch = deferredPlayerSwitch
    return true
  }

  clearDeferredPlayerSwitch(): boolean {
    const frame = this.current()
    if (!frame) return false
    frame.deferredPlayerSwitch = null
    return true
  }

  confirmDeferredPlayerSwitch(fromPlayerIndex: number, toPlayerIndex: number): boolean {
    const frame = this.current()
    if (!frame) return false
    const returnPlayerStack = frame.deferredPlayerSwitch?.returnPlayerStack
    frame.deferredPlayerSwitch = {
      fromPlayerIndex,
      toPlayerIndex,
      confirmed: true,
      returnPlayerStack,
    }
    return true
  }

  depth(): number {
    return this.frames.length
  }

  allFrames(): readonly EngineFrame[] {
    return this.frames
  }

  getActiveAnytimeActionIds(playerId: string): string[] {
    return this.frames.flatMap((frame) => frame.engine.getActiveAnytimeActionIds(playerId))
  }

  clear(): void {
    this.frames.length = 0
  }

  peekPendingEnvelope(): PendingEnvelope | null {
    return this.current()?.engine.peekPendingEnvelope() ?? null
  }

  peekPendingView(): PendingView | null {
    return pendingViewFromEnvelope(this.peekPendingEnvelope())
  }

  peekPendingCursor(): PendingCursor | null {
    return pendingCursorFromEnvelope(this.peekPendingEnvelope())
  }

  peekPendingHost(): EngineNode | null {
    return this.current()?.engine.peekPendingHost() ?? null
  }

  peekNextUnresolvedNodeId(): string | null {
    return this.current()?.engine.peekNextUnresolvedNodeId() ?? null
  }

  getEffectiveOwnerPlayerId(
    nodeId: string,
    frameOwnerPlayerId?: string,
  ): string | undefined {
    return this.current()?.engine.getEffectiveOwnerPlayerId(nodeId, frameOwnerPlayerId)
  }

  peekPendingChoiceFromComposite(): {
    nodeId: string
    promptKey?: PromptKey
    promptParams?: Record<string, unknown>
    options: ActionChoiceOption[]
    request?: InteractionRequest
  } | null {
    return this.current()?.engine.peekPendingChoiceFromComposite() ?? null
  }

  hasPendingChoiceCompositeAncestor(): boolean {
    return this.current()?.engine.hasPendingChoiceCompositeAncestor() ?? false
  }

  insertFlowAfterPendingChoice(flow: ActionFlow, ownerPlayerId?: string): void {
    this.current()?.engine.insertFlowAfterPendingChoice(flow, ownerPlayerId)
  }

  toCursor(): EngineStackCursor {
    return {
      frames: this.frames.map((f) => ({
        frameId: f.frameId,
        source: f.source,
        engineSnapshot: f.engine.snapshot(),
        ownerPlayerIndex: f.ownerPlayerIndex,
        spaceId: f.spaceId,
        stageResume: f.stageResume,
        deferredPlayerSwitch: f.deferredPlayerSwitch,
        undoBoundaryOnResolve: f.undoBoundaryOnResolve,
        reason: f.reason,
      })),
    }
  }

  static fromCursor(
    cursor: EngineStackCursor,
    rebuild: (
      source: EngineSource,
      snapshot: ReturnType<Engine['snapshot']>,
      frame: EngineFrameCursor,
    ) => Engine,
  ): EngineStack {
    const stack = new EngineStack()
    for (const fc of cursor.frames) {
      const engine = rebuild(fc.source, fc.engineSnapshot, fc)
      stack.push({
        frameId: fc.frameId,
        engine,
        source: fc.source,
        ownerPlayerIndex: fc.ownerPlayerIndex,
        spaceId: fc.spaceId,
        stageResume: fc.stageResume,
        deferredPlayerSwitch: fc.deferredPlayerSwitch,
        undoBoundaryOnResolve: fc.undoBoundaryOnResolve,
        reason: fc.reason,
      })
    }
    return stack
  }
}
