import type { ActionChoiceOption, InteractionRequest } from '../../contract/types'
import type { PromptKey } from '../../contract/prompt-keys'
import type { EngineNode, EngineContext, NodeStepResult } from '../types'
import { BaseNode } from './base'
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
  public resolveAfterSelection = false
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

  private remainingTriggerChildren(): { child: EngineNode; metadata: ParallelTriggerChild }[] {
    if (this.triggerChildren.length === 0) {
      return this.cardChildren()
        .filter((child) => child.getState() !== 'resolved')
        .map((child) => ({ child, metadata: this.triggerChildMetadata(child) }))
    }
    return this.triggerChildren
      .map((metadata) => ({
        metadata,
        child: this.children.find((child) => child.id === metadata.nodeId),
      }))
      .filter((entry): entry is { child: EngineNode; metadata: ParallelTriggerChild } =>
        Boolean(entry.child) && entry.child!.getState() !== 'resolved',
      )
  }

  getRemainingCardIds(): string[] {
    return this.cardChildren()
      .filter((c) => c.getState() !== 'resolved')
      .map((c) => c.params.cardId)
  }

  chooseCard(cardId: string): EngineNode | null {
    if (this.mode !== 'trigger-select') return null
    const entry = this.remainingTriggerChildren().find(({ metadata }) => metadata.cardId === cardId)
    if (!entry) return null
    this.selectedChildId = entry.child.id
    return entry.child
  }

  canPassTriggerSelection(): boolean {
    if (this.mode !== 'trigger-select') return false
    return !this.remainingTriggerChildren().some(({ metadata }) => metadata.mandatory === true)
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
    for (const child of this.children) {
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

  buildSelectOptions(): ActionChoiceOption[] {
    if (this.mode !== 'trigger-select') return []
    const remaining = this.remainingTriggerChildren()
    const cardOpts = remaining.map(({ metadata }) => {
      return {
        value: metadata.cardId,
        labelKey: `cards.${metadata.cardId}.name`,
        sourceCard: metadata.cardId,
      }
    })
    const anyMandatory = remaining.some(({ metadata }) => metadata.mandatory === true)
    if (!anyMandatory) {
      return [...cardOpts, { value: '__pass__', labelKey: 'ui.interactionSelectTriggerPass' }]
    }
    return cardOpts
  }

  private clearStaleSelection(): void {
    if (!this.selectedChildId) return
    const sel = this.cardChildren().find((c) => c.id === this.selectedChildId)
    if (!sel || sel.getState() === 'resolved') {
      if (this.resolveAfterSelection) {
        this.resolveRemainingTriggerChildrenForPass()
      }
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
      if (this.remainingTriggerChildren().length === 0) {
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
      if (this.resolveAfterSelection) data.resolveAfterSelection = true
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
