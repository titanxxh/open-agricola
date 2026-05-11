import type { ActionChoiceOption, InteractionRequest } from '../../contract/types'
import type { PromptKey } from '../../contract/prompt-keys'
import type { EngineContext, NodeStepResult } from '../types'
import { BaseNode } from './base'
import { ActivateCardNode } from './activate-card-node'

export class ParallelTriggerNode extends BaseNode {
  public children: ActivateCardNode[]
  public ownerPlayerId: string
  public selectedChildId: string | null = null
  public emittedChoices: ActionChoiceOption[] = []
  public emittedPromptKey?: PromptKey
  public emittedPromptParams?: Record<string, unknown>
  public emittedRequest?: InteractionRequest

  constructor(id: string, children: ActivateCardNode[], ownerPlayerId: string) {
    super(id, 'parallelTrigger' as never)
    this.children = children
    this.ownerPlayerId = ownerPlayerId
  }

  getRemainingCardIds(): string[] {
    return this.children
      .filter((c) => c.getState() !== 'resolved')
      .map((c) => c.cardId)
  }

  chooseCard(cardId: string): ActivateCardNode | null {
    const child = this.children.find((c) => c.cardId === cardId && c.getState() !== 'resolved') ?? null
    if (child) this.selectedChildId = child.id
    return child
  }

  passAll(): void {
    for (const child of this.children) {
      if (child.getState() !== 'resolved') child.resolve()
    }
    this.nodeState = 'resolved'
  }

  checkResolved(): void {
    if (this.children.every((c) => c.getState() === 'resolved')) {
      this.nodeState = 'resolved'
    }
  }

  buildSelectOptions() {
    const remaining = this.children.filter((c) => c.getState() !== 'resolved')
    const cardOpts = remaining.map((c) => ({
      value: c.cardId,
      labelKey: `cards.${c.cardId}.name`,
      sourceCard: c.cardId,
    }))
    return [...cardOpts, { value: '__pass__', labelKey: 'ui.interactionSelectTriggerPass' }]
  }

  private clearStaleSelection(): void {
    if (this.selectedChildId) {
      const sel = this.children.find((c) => c.id === this.selectedChildId)
      if (!sel || sel.getState() === 'resolved') {
        this.selectedChildId = null
      }
    }
  }

  step(_ctx: EngineContext): NodeStepResult {
    this.clearStaleSelection()
    if (this.children.every((c) => c.getState() === 'resolved')) {
      return { kind: 'done' }
    }
    if (this.selectedChildId) {
      return { kind: 'continue' }
    }
    const options = this.buildSelectOptions()
    const request: InteractionRequest = {
      kind: 'select-trigger',
      ownerPlayerId: this.ownerPlayerId,
      options,
    }
    this.emittedRequest = request
    this.emittedChoices = options
    this.emittedPromptKey = 'ui.interactionSelectTrigger' as PromptKey
    return { kind: 'request', request }
  }

  protected cursorData() {
    return {
      ownerPlayerId: this.ownerPlayerId,
      childrenIds: this.children.map((c) => c.id),
      selectedChildId: this.selectedChildId,
      emittedChoices: this.emittedChoices,
      emittedPromptKey: this.emittedPromptKey,
      emittedPromptParams: this.emittedPromptParams,
      emittedRequest: this.emittedRequest,
    }
  }
}
