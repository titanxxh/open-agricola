import type { ActionChoiceOption, InteractionRequest } from '../../game/types'
import type { PromptKey } from '../../game/prompt-keys'
import type { EngineNode } from '../types'
import { BaseNode } from './base'

export class OptionalNode extends BaseNode {
  public child: EngineNode
  public promptKey?: PromptKey
  public active = false
  public emittedChoices: ActionChoiceOption[] = []
  public emittedPromptKey?: PromptKey
  public emittedPromptParams?: Record<string, unknown>
  public emittedRequest?: InteractionRequest

  constructor(id: string, child: EngineNode, promptKey?: PromptKey) {
    super(id, 'optional')
    this.child = child
    this.promptKey = promptKey
  }

  getState() {
    if (this.nodeState === 'resolved') return 'resolved'
    if (this.active && this.child.getState() === 'resolved') {
      return 'resolved'
    }
    return this.nodeState
  }

  getArgs() {
    return { active: this.active }
  }

  resolve() {
    this.nodeState = 'resolved'
  }
}
