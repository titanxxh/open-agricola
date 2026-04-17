import type {
  ActionChoiceOption,
  ActionExecutionContext,
  ActionExecutionResult,
} from '../game/types'

export type NodeState = 'ready' | 'resolved' | 'blocked'

export type EngineNodeType =
  | 'action'
  | 'choice'
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
