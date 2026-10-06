import type {
  ActionChoiceOption,
  ActionExecutionContext,
  ActionExecutionResult,
  AnytimeWindow,
  InteractionRequest,
} from '../contract/types'
import type { PromptKey } from '../contract/prompt-keys'

export type NodeState = 'ready' | 'resolved' | 'blocked'

export type EngineNodeType =
  | 'action'
  | 'sequence'
  | 'parallel'
  | 'or'
  | 'xor'

export type EngineNode = {
  id: string
  type: EngineNodeType
  ownerPlayerId?: string
  optional?: boolean
  optionalActive?: boolean
  optionalPromptKey?: PromptKey
  anytimeWindow?: AnytimeWindow
  mandatory?: boolean
  beforeAnytimeAvailable?: boolean
  pending?: PendingEnvelope | null
  getState(): NodeState
  getArgs(): Record<string, unknown>
  resolve(result?: unknown): void
  isDoable(context: ActionExecutionContext): boolean
  setPending(envelope: PendingEnvelope): void
  clearPending(): void
  getPending(): PendingEnvelope | null
  /**
   * S4b PR5 sub-commit 4 — every node exposes a step() that returns a
   * NodeStepResult discriminator the engine main loop dispatches on.
   * Default (BaseNode) returns `{ kind: 'done' }`; rich nodes override.
   */
  step(ctx: EngineContext): NodeStepResult
}

export type EngineChoice = {
  promptKey?: string
  promptParams?: Record<string, unknown>
  options: ActionChoiceOption[]
}

export type PendingSyntheticKind =
  | 'interaction-only'
  | 'feed'
  | 'heating'
  | 'post-reap-anytime'
  | 'before-action-anytime'
  | 'confirm-next-player'
  | 'confirm-player-switch'
  | 'farm-select'

export type PendingEnvelope = {
  hostNodeId: string
  request: InteractionRequest
  choices?: ActionChoiceOption[]
  promptKey?: PromptKey
  promptParams?: Record<string, unknown>
  sourceCard?: string
  pendingActionId?: string
  ownerNodeId?: string | null
  contextSnapshot?: unknown
  effectiveOwnerPlayerId?: string
  syntheticKind?: PendingSyntheticKind
  internalHostNodeId?: string
  internalResultKey?: string
  internalPaymentInfoFrom?: string
}

export type PendingView = {
  request: InteractionRequest
  choices?: ActionChoiceOption[]
  promptKey?: PromptKey
  promptParams?: Record<string, unknown>
  sourceCard?: string
  effectiveOwnerPlayerId?: string
  syntheticKind?: PendingSyntheticKind
  costOverride?: ActionExecutionContext['costs']
}

export type PendingCursor = {
  hostNodeId: string
  pendingActionId?: string
  ownerNodeId?: string | null
  contextSnapshot?: unknown
  internalHostNodeId?: string
  internalResultKey?: string
  internalPaymentInfoFrom?: string
}

export type InteractionContextSnapshot = Pick<
  ActionExecutionContext,
  | 'params'
  | 'costs'
  | 'costTrades'
  | 'costBonuses'
  | 'paymentResourceProviders'
  | 'costAttribution'
  | 'sourceCard'
  | 'actionContext'
>

export type EngineStepResult =
  | { type: 'done' }
  | { type: 'blocked'; nodeId: string; actionId?: string; mandatory?: boolean }
  | { type: 'choice'; nodeId: string; choice: EngineChoice }
  | { type: 'ok'; nodeId: string; actionId?: string; sourceCard?: string; result: ActionExecutionResult }

export type NodeStepResult =
  | { kind: 'continue' }
  | { kind: 'done' }
  | { kind: 'blocked'; reason?: string }
  | { kind: 'choice'; nodeId: string }
  | { kind: 'request'; request: InteractionRequest }
  /**
   * S4b PR5 sub-commit 4 — leaf node signals it is ready for the
   * engine to invoke the action executor (cost / replace / before-phase
   * / hook / dispatcher) on the node's `actionId`. Returned by
   * `ActionNode.step()`.
   */
  | { kind: 'execute'; nodeId: string; actionId: string }

export type NodeCursor = {
  type: EngineNodeType
  id: string
  state: NodeState
  data: Record<string, unknown>
}

export type EngineContext = {
  resolveSubtree(node: EngineNode): void
  emitChoice(nodeId: string, choices: ActionChoiceOption[]): void
}
