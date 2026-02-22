import type {
  ActionChoiceOption,
  ActionExecutionContext,
  ActionExecutionResult,
} from '../game/types'
import type { EngineNode, EngineNodeType, NodeState } from './types'

abstract class BaseNode implements EngineNode {
  public id: string
  public type: EngineNodeType
  protected state: NodeState

  protected constructor(id: string, type: EngineNodeType) {
    this.id = id
    this.type = type
    this.state = 'ready'
  }

  getState() {
    return this.state
  }

  getArgs() {
    return {}
  }

  resolve(_result?: unknown) {
    this.state = 'resolved'
  }

  block() {
    this.state = 'blocked'
  }

  setState(state: NodeState) {
    this.state = state
  }

  isDoable() {
    return true
  }
}

export class ActionNode extends BaseNode {
  public actionId: string

  constructor(id: string, actionId: string) {
    super(id, 'action')
    this.actionId = actionId
  }

  execute(
    context: ActionExecutionContext & { actionId: string },
    executor: (context: ActionExecutionContext) => ActionExecutionResult,
  ) {
    return executor(context)
  }

  isDoable() {
    return true
  }
}

export class ChoiceNode extends BaseNode {
  public choices: ActionChoiceOption[]
  public promptKey?: string

  constructor(id: string, choices: ActionChoiceOption[]) {
    super(id, 'choice')
    this.choices = choices
  }

  setChoice(promptKey: string | undefined, choices: ActionChoiceOption[]) {
    this.promptKey = promptKey
    this.choices = choices
    this.state = 'ready'
  }

  resolve(choice: string) {
    if (!this.choices.some((item) => item.value === choice)) {
      this.block()
      return
    }
    this.state = 'resolved'
  }
}

export class SequenceNode extends BaseNode {
  public children: EngineNode[]

  constructor(id: string, children: EngineNode[]) {
    super(id, 'sequence')
    this.children = children
  }

  getState() {
    if (this.children.every((child) => child.getState() === 'resolved')) {
      return 'resolved'
    }
    return this.state
  }
}

export class ParallelNode extends BaseNode {
  public children: EngineNode[]

  constructor(id: string, children: EngineNode[]) {
    super(id, 'parallel')
    this.children = children
  }

  resolve(policy: 'all' | 'any' = 'all') {
    if (policy === 'any') {
      this.state = 'resolved'
      return
    }
    if (this.children.every((child) => child.getState() === 'resolved')) {
      this.state = 'resolved'
    }
  }
}

export class OrNode extends BaseNode {
  public children: EngineNode[]
  public promptKey?: string

  constructor(id: string, children: EngineNode[], promptKey?: string) {
    super(id, 'or')
    this.children = children
    this.promptKey = promptKey
  }
}

export class XorNode extends BaseNode {
  public children: EngineNode[]
  public promptKey?: string

  constructor(id: string, children: EngineNode[], promptKey?: string) {
    super(id, 'xor')
    this.children = children
    this.promptKey = promptKey
  }
}

export class OptionalNode extends BaseNode {
  public child: EngineNode
  public promptKey?: string
  public active = false

  constructor(id: string, child: EngineNode, promptKey?: string) {
    super(id, 'optional')
    this.child = child
    this.promptKey = promptKey
  }

  getState() {
    if (this.state === 'resolved') return 'resolved'
    if (this.active && this.child.getState() === 'resolved') {
      return 'resolved'
    }
    return this.state
  }

  getArgs() {
    return { active: this.active }
  }

  resolve() {
    this.state = 'resolved'
  }
}
