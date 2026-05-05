import type { ActionChoiceOption, InteractionRequest } from '../../game/types'
import type { PromptKey } from '../../game/prompt-keys'
import type { EngineNode } from '../types'
import { BaseNode } from './base'

export class XorNode extends BaseNode {
  public children: EngineNode[]
  public promptKey?: PromptKey
  public emittedChoices: ActionChoiceOption[] = []
  public emittedPromptKey?: PromptKey
  public emittedPromptParams?: Record<string, unknown>
  public emittedRequest?: InteractionRequest

  constructor(id: string, children: EngineNode[], promptKey?: PromptKey) {
    super(id, 'xor')
    this.children = children
    this.promptKey = promptKey
  }
}
