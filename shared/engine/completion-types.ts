import type { SpaceUseState } from './space-use-types'
import type { MoorCompletionFrame } from '../moor/completion-types'

export type CompletionDomain = { kind: 'space-use' } & SpaceUseState | { kind: 'moor'; frame: MoorCompletionFrame }

export type CompletionState = CompletionDomain & {
  bodyId: string
  immediateId: string
  afterId: string
  bodyCompleted: boolean
}
export type CompletionPhase = { scopeId: string; phase: 'immediatelyAfter' | 'after' }
