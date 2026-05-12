import type { ActionChoiceOption, InteractionRequest } from '../../contract/types'
import type { PromptKey } from '../../contract/prompt-keys'
import type { EngineContext, EngineNode, NodeStepResult } from '../types'
import { BaseNode } from './base'
import { ActivateCardNode } from './activate-card-node'

/**
 * BGA-style PARALLEL trigger selector.
 *
 * `buildPhaseTrailingNodes` wraps **all** matched listeners (even a single
 * listener) for an owner group as `ActivateCardNode` children of this node.
 * When there are multiple unresolved children the engine emits
 * `kind: 'select-trigger'`; PASS is offered only when **every** unresolved
 * child is explicitly `mandatory: false` (default is mandatory). When only
 * one option remains the node short-circuits to a `continue` step so the
 * tree walker descends into that single child without surfacing a choice.
 *
 * `children` holds a heterogeneous mix at runtime:
 *   - The initial `ActivateCardNode[]` placed by the dispatcher.
 *   - Flow nodes (`SequenceNode` / leaf / nested `ParallelTriggerNode` etc.)
 *     inserted by the engine after a card's activation.
 *
 * Selector-only methods (`getRemainingCardIds`, `chooseCard`,
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
    // BGA-style: default mandatory = true. PASS shown only when **every**
    // unresolved trigger is explicitly `mandatory: false`.
    const allOptional = remaining.length > 0 && remaining.every((c) => c.event.mandatory === false)
    if (allOptional) {
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
    // Single mandatory option (no PASS, exactly one card remaining) → auto
    // resolve so the engine main loop stays on the `ok` path. This makes
    // single-listener cases (the common shape) identical to the legacy
    // direct-ActivateCardNode behavior without surfacing a choice the
    // player has no real say in.
    if (options.length === 1 && options[0]!.value !== '__pass__') {
      const onlyCard = this.cardChildren().find((c) => c.cardId === options[0]!.value && c.getState() !== 'resolved')
      if (onlyCard) {
        this.selectedChildId = onlyCard.id
        return { kind: 'continue' }
      }
    }
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
