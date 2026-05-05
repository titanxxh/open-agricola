import type {
  ActionChoiceOption,
  ActionExecutionContext,
  ActionExecutionResult,
  InteractionRequest,
} from '../game/types'

export type NodeState = 'ready' | 'resolved' | 'blocked'

export type EngineNodeType =
  | 'action'
  | 'interaction'
  | 'sequence'
  | 'parallel'
  | 'or'
  | 'xor'
  | 'optional'
  | 'activateCard'
  | 'playerSwitch'

export type EngineNode = {
  id: string
  type: EngineNodeType
  getState(): NodeState
  getArgs(): Record<string, unknown>
  resolve(result?: unknown): void
  isDoable(context: ActionExecutionContext): boolean
}

export type EngineChoice = {
  promptKey?: string
  promptParams?: Record<string, unknown>
  options: ActionChoiceOption[]
}

export type EngineStepResult =
  | { type: 'done' }
  | { type: 'blocked'; nodeId: string }
  | { type: 'choice'; nodeId: string; choice: EngineChoice }
  | { type: 'ok'; nodeId: string; actionId?: string; result: ActionExecutionResult }
  | { type: 'playerSwitch'; nodeId: string; targetPlayerId: string }

export type NodeStepResult =
  | { kind: 'continue' }
  | { kind: 'done' }
  | { kind: 'blocked'; reason?: string }
  | { kind: 'choice'; nodeId: string }
  | { kind: 'playerSwitch'; targetPlayerId: string }
  | { kind: 'request'; request: InteractionRequest }

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
