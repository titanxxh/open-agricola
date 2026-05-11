import type { EngineContext, NodeStepResult } from '../types'
import { BaseNode } from './base'
import { ActivateCardNode } from './activate-card-node'

export class ParallelTriggerNode extends BaseNode {
  public children: ActivateCardNode[]
  public ownerPlayerId: string

  constructor(id: string, children: ActivateCardNode[], ownerPlayerId: string) {
    super(id, 'parallelTrigger' as never)
    this.children = children
    this.ownerPlayerId = ownerPlayerId
    this.nodeState = 'pending'
  }

  getRemainingCardIds(): string[] {
    return this.children
      .filter((c) => c.getState() !== 'resolved')
      .map((c) => c.cardId)
  }

  chooseCard(cardId: string): ActivateCardNode | null {
    return this.children.find((c) => c.cardId === cardId && c.getState() !== 'resolved') ?? null
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

  step(_ctx: EngineContext): NodeStepResult {
    if (this.children.every((c) => c.getState() === 'resolved')) {
      return { kind: 'done' }
    }
    return { kind: 'continue' }
  }

  protected cursorData() {
    return {
      ownerPlayerId: this.ownerPlayerId,
      childrenIds: this.children.map((c) => c.id),
    }
  }
}
