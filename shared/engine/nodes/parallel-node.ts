import type { ActionChoiceOption, InteractionRequest } from '../../contract/types'
import type { PromptKey } from '../../contract/prompt-keys'
import type { EngineNode, EngineContext, NodeStepResult } from '../types'
import { BaseNode } from './base'
import { ActionNode } from './action-node'
import { isActivateCardActionNode, type ActivateCardActionNode } from '../activation-action'

export type ParallelNodeMode = 'all' | 'trigger-select'

export type ParallelTriggerChild = {
  nodeId: string
  cardId: string
  listenerId: string
  mandatory: boolean
}

export class ParallelNode extends BaseNode {
  public children: EngineNode[]
  public mode: ParallelNodeMode = 'all'
  public selectedChildId: string | null = null
  public triggerOwnerPlayerId?: string
  public triggerChildren: ParallelTriggerChild[] = []
  public emittedChoices: ActionChoiceOption[] = []
  public emittedPromptKey?: PromptKey
  public emittedPromptParams?: Record<string, unknown>
  public emittedRequest?: InteractionRequest

  constructor(id: string, children: EngineNode[]) {
    super(id, 'parallel')
    this.children = children
  }

  private cardChildren(): ActivateCardActionNode[] {
    return this.children.filter(isActivateCardActionNode)
  }

  getRemainingCardIds(): string[] {
    return this.cardChildren()
      .filter((c) => c.getState() !== 'resolved')
      .map((c) => c.params.cardId)
  }

  chooseCard(cardId: string): ActionNode | null {
    if (this.mode !== 'trigger-select') return null
    const child = this.cardChildren().find((c) => c.params.cardId === cardId && c.getState() !== 'resolved') ?? null
    if (child) this.selectedChildId = child.id
    return child
  }

  canPassTriggerSelection(): boolean {
    if (this.mode !== 'trigger-select') return false
    return !this.remainingCardChildren().some((c) => this.triggerChildMetadata(c).mandatory === true)
  }

  passAll(): boolean {
    if (this.mode !== 'trigger-select' || !this.canPassTriggerSelection()) return false
    for (const child of this.children) {
      if (child.getState() !== 'resolved') child.resolve()
    }
    this.nodeState = 'resolved'
    return true
  }

  resolveRemainingTriggerChildrenForPass(): void {
    if (this.mode !== 'trigger-select') return
    for (const child of this.cardChildren()) {
      if (child.getState() !== 'resolved') child.resolve()
    }
    this.checkResolved()
  }

  checkResolved(): void {
    if (this.children.every((c) => c.getState() === 'resolved')) {
      this.nodeState = 'resolved'
    }
  }

  private triggerChildMetadata(child: ActivateCardActionNode): ParallelTriggerChild {
    return this.triggerChildren.find((entry) => entry.nodeId === child.id) ?? {
      nodeId: child.id,
      cardId: child.params.cardId,
      listenerId: child.params.listenerId,
      mandatory: child.params.mandatory === true,
    }
  }

  private remainingCardChildren(): ActivateCardActionNode[] {
    return this.cardChildren().filter((c) => c.getState() !== 'resolved')
  }

  buildSelectOptions(): ActionChoiceOption[] {
    if (this.mode !== 'trigger-select') return []
    const remaining = this.remainingCardChildren()
    const cardOpts = remaining.map((c) => {
      const metadata = this.triggerChildMetadata(c)
      return {
        value: metadata.cardId,
        labelKey: `cards.${metadata.cardId}.name`,
        sourceCard: metadata.cardId,
      }
    })
    const anyMandatory = remaining.some((c) => this.triggerChildMetadata(c).mandatory === true)
    if (!anyMandatory) {
      return [...cardOpts, { value: '__pass__', labelKey: 'ui.interactionSelectTriggerPass' }]
    }
    return cardOpts
  }

  private clearStaleSelection(): void {
    if (!this.selectedChildId) return
    const sel = this.cardChildren().find((c) => c.id === this.selectedChildId)
    if (!sel || sel.getState() === 'resolved') {
      this.selectedChildId = null
    }
  }

  resolve(policy: 'all' | 'any' = 'all') {
    if (policy === 'any') {
      this.nodeState = 'resolved'
      return
    }
    if (this.children.every((child) => child.getState() === 'resolved')) {
      this.nodeState = 'resolved'
    }
  }

  step(_ctx: EngineContext): NodeStepResult {
    if (this.mode === 'trigger-select') {
      this.clearStaleSelection()
      if (this.children.every((c) => c.getState() === 'resolved')) {
        return { kind: 'done' }
      }
      if (this.selectedChildId) {
        return { kind: 'continue' }
      }
      if (this.cardChildren().every((c) => c.getState() === 'resolved')) {
        return { kind: 'continue' }
      }
      const options = this.buildSelectOptions()
      const request: InteractionRequest = {
        kind: 'select-trigger',
        ownerPlayerId: this.triggerOwnerPlayerId ?? this.ownerPlayerId ?? '',
        options,
      }
      this.emittedRequest = request
      this.emittedChoices = options
      this.emittedPromptKey = 'ui.interactionSelectTrigger' as PromptKey
      return { kind: 'request', request }
    }
    if (this.children.every((c) => c.getState() === 'resolved')) {
      return { kind: 'done' }
    }
    return { kind: 'continue' }
  }

  protected cursorData() {
    const data: Record<string, unknown> = { childrenIds: this.children.map((c) => c.id) }
    if (this.mode === 'trigger-select') {
      data.mode = this.mode
      data.selectedChildId = this.selectedChildId
      data.triggerOwnerPlayerId = this.triggerOwnerPlayerId
      data.triggerChildren = this.triggerChildren
      data.emittedChoices = this.emittedChoices
      if (this.emittedPromptKey !== undefined) data.emittedPromptKey = this.emittedPromptKey
      if (this.emittedPromptParams !== undefined) data.emittedPromptParams = this.emittedPromptParams
      if (this.emittedRequest !== undefined) data.emittedRequest = this.emittedRequest
    }
    return data
  }
}
