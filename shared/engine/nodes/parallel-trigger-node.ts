import type { ActionChoiceOption, InteractionRequest } from '../../contract/types'
import type { PromptKey } from '../../contract/prompt-keys'
import type { EngineContext, EngineNode, NodeStepResult } from '../types'
import { BaseNode } from './base'
import { ActivateCardNode } from './activate-card-node'

/**
 * BGA-style PARALLEL trigger selector.
 *
 * When the dispatcher (`buildPhaseTrailingNodes`) detects multiple matched
 * listeners whose flows are `interactive`, it wraps them as `ActivateCardNode`
 * children of this node. The engine main loop emits `kind: 'select-trigger'`
 * with one option per remaining card (+ `__pass__`); after the player picks a
 * card, `chooseCard` records `selectedChildId` and the engine activates that
 * child. The child's flow nodes are then inserted **inside this node's
 * children array, right after the activated card**, so the tree walker
 * (`nextUnresolved`) executes the entire trigger's flow (including any nested
 * sub-PARALLELs) before returning here to prompt for the next card.
 *
 * `children` therefore holds a heterogeneous mix at runtime:
 *   - The initial `ActivateCardNode[]` placed by the dispatcher (one per card)
 *   - Flow nodes (`SequenceNode` / leaf / `ParallelTriggerNode` etc.) inserted
 *     by the engine **after** a card's activation, occupying the slot between
 *     the activated `ActivateCardNode` and the next card.
 *
 * The selector-only methods (`getRemainingCardIds`, `chooseCard`,
 * `buildSelectOptions`, `passAll`) filter for `ActivateCardNode` instances.
 */
export class ParallelTriggerNode extends BaseNode {
  public children: EngineNode[]
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

  private cardChildren(): ActivateCardNode[] {
    return this.children.filter((c): c is ActivateCardNode => c instanceof ActivateCardNode)
  }

  getRemainingCardIds(): string[] {
    return this.cardChildren()
      .filter((c) => c.getState() !== 'resolved')
      .map((c) => c.cardId)
  }

  chooseCard(cardId: string): ActivateCardNode | null {
    const child = this.cardChildren().find((c) => c.cardId === cardId && c.getState() !== 'resolved') ?? null
    if (child) this.selectedChildId = child.id
    return child
  }

  passAll(): void {
    // Resolve all unresolved card children + any follow-up nodes that may have
    // been inserted after a partially-completed activation. Resolving non-card
    // nodes is a no-op for leaf flows; composite flows would already have been
    // walked by the engine before pass was reachable.
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
    const remaining = this.cardChildren().filter((c) => c.getState() !== 'resolved')
    const cardOpts = remaining.map((c) => ({
      value: c.cardId,
      labelKey: `cards.${c.cardId}.name`,
      sourceCard: c.cardId,
    }))
    // PASS hidden only when at least one unresolved trigger is explicitly
    // mandatory (`mandatory: true`). Default is optional (PASS offered) — this
    // preserves BGA-aligned behavior for the bulk of cards that have no
    // explicit mandatory declaration, while letting future cards opt into
    // mandatory by setting `mandatory: true` on the listener registration.
    const anyMandatory = remaining.some((c) => c.event.mandatory === true)
    if (!anyMandatory) {
      return [...cardOpts, { value: '__pass__', labelKey: 'ui.interactionSelectTriggerPass' }]
    }
    return cardOpts
  }

  private clearStaleSelection(): void {
    if (this.selectedChildId) {
      const sel = this.cardChildren().find((c) => c.id === this.selectedChildId)
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
    if (this.cardChildren().every((c) => c.getState() === 'resolved')) {
      // No more cards to choose, but some follow-up nodes still unresolved.
      // Let the tree walker descend into the follow-ups directly.
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
