import type { Engine } from './engine'
import type { ActionFlow } from '../game/types'

export type EngineSource =
  | { kind: 'action'; actionId: string }
  | { kind: 'flow'; flow: ActionFlow }

export type SubFlowReason = 'reorganize' | 'feed' | 'card-draft' | 'confirm-next-player' | 'confirm-player-switch'

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

  peekInteraction(): import('./nodes').InteractionNode | null {
    return this.current()?.engine.peekInteraction() ?? null
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
