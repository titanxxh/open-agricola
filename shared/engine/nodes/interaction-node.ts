import type { ActionChoiceOption, InteractionRequest } from '../../game/types'
import type { PromptKey } from '../../game/prompt-keys'
import { BaseNode } from './base'

export class InteractionNode extends BaseNode {
  public choices: ActionChoiceOption[]
  public promptKey?: PromptKey
  /**
   * Optional i18n params passed alongside `promptKey`. Lifted out of the
   * legacy `this.pending` field (Task 10) so the InteractionNode is now the
   * canonical owner of all prompt-related metadata. Cursor round-trip does
   * NOT persist this field today (snapshot.choiceData omits it); restored
   * sessions surface `undefined` until the next ChoiceNode emits a fresh value.
   */
  public promptParams?: Record<string, unknown>
  public request?: InteractionRequest

  constructor(id: string, choices: ActionChoiceOption[], request?: InteractionRequest) {
    super(id, 'interaction')
    this.choices = choices
    this.request = request
  }

  setChoice(
    promptKey: PromptKey | undefined,
    choices: ActionChoiceOption[],
    promptParams?: Record<string, unknown>,
  ) {
    this.promptKey = promptKey
    this.choices = choices
    this.promptParams = promptParams
    this.nodeState = 'ready'
  }

  resolve(choice: string) {
    if (!this.choices.some((item) => item.value === choice)) {
      this.block()
      return
    }
    this.nodeState = 'resolved'
  }
}
